"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Card, Alert } from "@nemis-desktop/ui";
import { ArrowLeft, Check, AlertTriangle } from "lucide-react";
import type { CountyCreateUserRequest, CountyUserRole } from "@nemis-desktop/types";
import { useCountyUserOptionsViewModel } from "@/lib/presentation/hooks/county";
import { useConnectivityStore } from "@/lib/presentation/hooks/shared";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { countyBridge } from "@/services/nemis-bridge/county";
import { ActivationLinkDisplay } from "@/components/county/users/ActivationLinkDisplay";

const STEPS = [
  { number: 1, title: "Basic Information", description: "User details" },
  { number: 2, title: "Role & Assignment", description: "Role selection" },
  { number: 3, title: "Review & Submit", description: "Confirm details" },
];

const USERS_PATH = "/government/county/users";

// Same wording as the list page: the server took the change, the follow-up
// pull did not run, so local data catches up on the next sync.
const SYNC_NOTE = "Saved — this will appear once this device syncs.";

/** getCreatableRoles(COUNTY_ADMIN) on the web, with @nemis/types USER_ROLE_LABELS. */
const CREATABLE_ROLES: CountyUserRole[] = ["DEO", "INSTITUTION_ADMIN"];
const ROLE_LABELS: Record<CountyUserRole, string> = {
  DEO: "DEO",
  INSTITUTION_ADMIN: "Institution Admin",
};

const isCreatableRole = (value: string | null | undefined): value is CountyUserRole =>
  !!value && (CREATABLE_ROLES as string[]).includes(value);

// createUserSchema (Nemis packages/types user.ts): zod v3's email pattern and
// the server's phone rule. Messages are the schema's, in zod's issue order.
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;
const PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/;

interface FormValues {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  role: string;
  institutionId: string;
}
type FieldName = keyof FormValues;
type FormErrors = Partial<Record<FieldName, string>>;

const STEP_FIELDS: Record<number, FieldName[]> = {
  1: ["firstName", "lastName", "phoneNumber", "email"],
  2: ["role", "institutionId"],
  3: [],
};

function validateField(field: FieldName, values: FormValues): string | undefined {
  const value = values[field].trim();
  switch (field) {
    case "firstName":
      if (!value) return "First name is required";
      if (value.length > 100) return "First name is too long";
      return undefined;
    case "lastName":
      if (!value) return "Last name is required";
      if (value.length > 100) return "Last name is too long";
      return undefined;
    case "email":
      // zod checks .email() before .min(1), so an empty email reads "Invalid email address".
      if (!EMAIL_PATTERN.test(value)) return "Invalid email address";
      if (value.length > 255) return "Email is too long";
      return undefined;
    case "phoneNumber":
      if (!value) return "Phone number is required";
      if (!PHONE_PATTERN.test(value)) {
        return "Invalid phone number format (use international format, e.g., +231770123456)";
      }
      return undefined;
    case "role":
      return isCreatableRole(value) ? undefined : "Please select a valid role";
    case "institutionId":
      // Desktop: the web lets a School Admin through with no school (it then
      // creates a county-scoped link); here a school is required.
      return values.role === "INSTITUTION_ADMIN" && !value ? "Institution is required" : undefined;
  }
}

function validateFields(fields: FieldName[], values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const field of fields) {
    const message = validateField(field, values);
    if (message) errors[field] = message;
  }
  return errors;
}

/** The web's getErrorMessage friendly text, applied to the IPC error's message. */
function friendlyCreateError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("email already registered") ||
    normalized.includes("email already exists") ||
    normalized.includes("already registered") ||
    normalized.includes("unique constraint")
  ) {
    return "This email is already registered in the system. Use a different email address, or check the Users list to manage the existing account.";
  }
  return message;
}

/** Port of portal-web government/county/users/create (spec §2, §5.4). Creation
 * is an online command; the main process adds the County Admin's countyId. */
function CreateUserWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);
  const optionsVm = useCountyUserOptionsViewModel();
  const options = useViewModel(optionsVm.store, (s) => s.options);
  useRevalidateOnSync(() => {
    void optionsVm.load();
  }, [optionsVm]);

  const optionData = options.status === "success" || options.status === "refreshing" ? options.data : null;
  const county = optionData?.county ?? null;
  const schools = optionData?.schools ?? [];

  // Pre-selected role from ?role= (only a role this admin may create).
  const roleParam = searchParams.get("role");
  const preSelectedRole = isCreatableRole(roleParam) ? roleParam : "";

  const [currentStep, setCurrentStep] = useState(1);
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [values, setValues] = useState<FormValues>({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    role: preSelectedRole,
    institutionId: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  // The activation URL lives only here, while the success panel is shown.
  const [createdUser, setCreatedUser] = useState<{
    activationUrl: string | null;
    email: string;
    name: string;
    refreshed: boolean;
  } | null>(
    null,
  );

  useEffect(() => {
    if (preSelectedRole) setValues((v) => ({ ...v, role: preSelectedRole }));
  }, [preSelectedRole]);

  const selectedRole = values.role;

  const setField = (field: FieldName, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    // Once a field shows an error, re-check it as the user fixes it.
    if (errors[field]) setErrors((e) => ({ ...e, [field]: validateField(field, next) }));
  };

  // mode: "onBlur", as on the web.
  const handleBlur = (field: FieldName) => {
    setErrors((e) => ({ ...e, [field]: validateField(field, values) }));
  };

  const fieldProps = (field: FieldName) => ({
    value: values[field],
    onChange: (e: { target: { value: string } }) => setField(field, e.target.value),
    onBlur: () => handleBlur(field),
  });

  const handleNext = () => {
    // Desktop: Next checks the current step, so an error is never hidden on an earlier step.
    const fields = STEP_FIELDS[currentStep] ?? [];
    const stepErrors = validateFields(fields, values);
    setErrors((e) => {
      const next = { ...e };
      for (const field of fields) next[field] = stepErrors[field];
      return next;
    });
    if (Object.keys(stepErrors).length > 0) return;
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    router.push(USERS_PATH);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (currentStep < STEPS.length || !online || isLoading) return;
    setServerError("");

    const allErrors = validateFields([...(STEP_FIELDS[1] ?? []), ...(STEP_FIELDS[2] ?? [])], values);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setCurrentStep(allErrors.firstName || allErrors.lastName || allErrors.phoneNumber || allErrors.email ? 1 : 2);
      return;
    }

    const role = values.role as CountyUserRole;
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const email = values.email.trim().toLowerCase();
    const request: CountyCreateUserRequest = {
      firstName,
      lastName,
      email,
      phoneNumber: values.phoneNumber.trim(),
      role,
      ...(role === "INSTITUTION_ADMIN" ? { institutionId: values.institutionId } : {}),
    };

    setIsLoading(true);
    try {
      const result = await countyBridge.createUser(request);
      setCreatedUser({
        activationUrl: result.data.activationUrl,
        email,
        name: `${firstName} ${lastName}`,
        refreshed: result.refreshed,
      });
    } catch (error: unknown) {
      const message = parseIpcError(error)?.message;
      setServerError(message ? friendlyCreateError(message) : "Failed to create user. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (createdUser) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {!createdUser.refreshed && (
            <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm text-sky-700">{SYNC_NOTE}</p>
            </div>
          )}
          <ActivationLinkDisplay
            activationUrl={createdUser.activationUrl}
            email={createdUser.email}
            userName={createdUser.name}
            onClose={() => router.push(USERS_PATH)}
          />
        </div>
      </div>
    );
  }

  const reviewEmail = values.email.trim().toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Users
          </button>
          <h1 className="text-3xl font-bold text-neutral-dark">Create New User</h1>
          <p className="text-gray-600 mt-2">Add a new user to your county system.</p>
        </div>

        {!online && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">User changes need an internet connection.</p>
          </div>
        )}

        <div className="flex gap-8">
          {/* Vertical Progress Indicator - Left Side */}
          <div className="w-64 flex-shrink-0">
            <Card className="sticky top-8">
              <h2 className="text-lg font-semibold text-neutral-dark mb-6">Progress</h2>
              <div className="space-y-1">
                {STEPS.map((step, index) => (
                  <div key={step.number}>
                    <div
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                        currentStep === step.number
                          ? "bg-primary/10 border-l-4 border-primary"
                          : currentStep > step.number
                            ? "bg-green-50 border-l-4 border-green-500"
                            : "bg-white border-l-4 border-transparent"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                          currentStep === step.number
                            ? "bg-primary text-white"
                            : currentStep > step.number
                              ? "bg-green-500 text-white"
                              : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {currentStep > step.number ? <Check className="w-4 h-4" /> : step.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            currentStep === step.number
                              ? "text-primary"
                              : currentStep > step.number
                                ? "text-green-700"
                                : "text-gray-600"
                          }`}
                        >
                          {step.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                      </div>
                    </div>
                    {index < STEPS.length - 1 && (
                      <div
                        className={`ml-7 h-6 w-0.5 ${currentStep > step.number ? "bg-green-500" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Main Content - Right Side */}
          <div className="flex-1 min-w-0">
            <form onSubmit={(e) => void onSubmit(e)} noValidate>
              {serverError && (
                <div className="p-4 bg-error/10 border border-error rounded-lg mb-6">
                  <p className="text-error text-sm">{serverError}</p>
                </div>
              )}

              {/* Step 1: Basic Information */}
              {currentStep === 1 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-6">Basic Information</h2>

                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                    <p className="text-sm text-gray-700">
                      <strong>County:</strong> {county?.name || "Loading..."}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Users will be created within this county</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Input label="First Name" required {...fieldProps("firstName")} placeholder="John" />
                        {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
                      </div>
                      <div>
                        <Input label="Last Name" required {...fieldProps("lastName")} placeholder="Doe" />
                        {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <Input
                        label="Phone Number"
                        required
                        {...fieldProps("phoneNumber")}
                        placeholder="+231770123456"
                      />
                      {errors.phoneNumber && <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>}
                    </div>

                    <div>
                      <Input
                        label="Email"
                        required
                        type="email"
                        {...fieldProps("email")}
                        placeholder="user@example.com"
                      />
                      {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                      <p className="mt-1 text-xs text-gray-600">Activation link will be sent to this email</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Step 2: Role & Assignment */}
              {currentStep === 2 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-6">Role & Assignment</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Role <span className="text-error">*</span>
                      </label>
                      <select
                        {...fieldProps("role")}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      >
                        <option value="">Select a role</option>
                        {CREATABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      {errors.role && <p className="text-error text-sm mt-1">{errors.role}</p>}
                      <p className="mt-1 text-xs text-gray-600">County admins can create DEOs and School Admins</p>
                    </div>

                    {selectedRole === "DEO" && (
                      <Alert variant="info">
                        <div className="space-y-2">
                          <p className="font-semibold text-sm">ℹ️ DEO Assignment</p>
                          <p className="text-sm">
                            DEOs are created without a district assignment. After creation, you can assign them to
                            a district from the Districts page.
                          </p>
                          <p className="text-xs text-gray-600 mt-2">
                            This allows DEOs to be transferred between districts and counties as needed.
                          </p>
                        </div>
                      </Alert>
                    )}

                    {selectedRole === "INSTITUTION_ADMIN" && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Institution <span className="text-error">*</span>
                        </label>
                        <select
                          {...fieldProps("institutionId")}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                        >
                          <option value="">Select institution</option>
                          {schools.map((institution) => (
                            <option key={institution.id} value={institution.id}>
                              {institution.name}
                            </option>
                          ))}
                        </select>
                        {errors.institutionId && <p className="text-error text-sm mt-1">{errors.institutionId}</p>}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Step 3: Review & Submit */}
              {currentStep === 3 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-6">Review & Submit</h2>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-4">Review User Information</h4>
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-gray-600">Name</dt>
                        <dd className="font-medium text-gray-900">
                          {values.firstName.trim()} {values.lastName.trim()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-600">Email</dt>
                        <dd className="font-medium text-gray-900">{reviewEmail}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-600">Phone</dt>
                        <dd className="font-medium text-gray-900">{values.phoneNumber.trim()}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-600">Role</dt>
                        <dd className="font-medium text-gray-900">
                          {isCreatableRole(selectedRole) ? ROLE_LABELS[selectedRole] : "N/A"}
                        </dd>
                      </div>
                      {selectedRole === "INSTITUTION_ADMIN" && values.institutionId && (
                        <div>
                          <dt className="text-gray-600">Institution</dt>
                          <dd className="font-medium text-gray-900">
                            {schools.find((s) => s.id === values.institutionId)?.name || "N/A"}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between mt-6">
                <div>
                  {currentStep > 1 && (
                    <Button type="button" variant="secondary" size="lg" onClick={handlePrevious} disabled={isLoading}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Previous
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <Button type="button" variant="secondary" size="lg" onClick={handleCancel} disabled={isLoading}>
                    Cancel
                  </Button>

                  {/* Separate conditionals with keys (as CreateSchoolPage): a shared
                      slot would let React reuse the Next <button> as the submit
                      button, so the Next click itself would submit the form. */}
                  {currentStep < STEPS.length && (
                    <Button key="next" type="button" variant="primary" size="lg" onClick={handleNext}>
                      Next
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  )}
                  {currentStep === STEPS.length && (
                    <Button
                      key="submit"
                      type="submit"
                      variant="primary"
                      size="lg"
                      loading={isLoading}
                      disabled={!online}
                    >
                      Create User
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// useSearchParams() (the web's ?role= preselect) in a statically exported
// route must sit under a Suspense boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CreateUserWizard />
    </Suspense>
  );
}
