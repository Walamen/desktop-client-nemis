"use client";

import { useEffect, useState } from "react";
import { Button, Drawer, Input, Select } from "@nemis-desktop/ui";
import {
  SCHOOL_MODULE_PRESETS,
  type CreateSchoolUserRequest,
  type CreateSchoolUserResult,
  type LinkableStaff,
  type SchoolModule,
  type SchoolOfficeUser,
  type UpdateSchoolUserRequest,
} from "@nemis-desktop/types";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { schoolUsersBridge } from "@/services/nemis-bridge/school-admin/school-users-bridge";
import { ModuleChecklist } from "./ModuleChecklist";

/** Same limits the main process enforces (validateIpc assertSchoolUser*Args). */
const NAME_MAX = 100;
const EMAIL_MAX = 255;
const PHONE_MAX = 30;
const TITLE_MAX = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PresetId = (typeof SCHOOL_MODULE_PRESETS)[number]["id"] | "CUSTOM";

const PRESET_OPTIONS = [
  ...SCHOOL_MODULE_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: "CUSTOM", label: "Custom" },
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  title: string;
  preset: PresetId;
  modules: SchoolModule[];
  staffId: string;
}

type Errors = Partial<Record<"firstName" | "lastName" | "email" | "phoneNumber" | "title" | "modules", string>>;

const emptyForm = (): FormState => ({
  firstName: "", lastName: "", email: "", phoneNumber: "", title: "", preset: "CUSTOM", modules: [], staffId: "",
});

const formFor = (user: SchoolOfficeUser): FormState => ({
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email ?? "",
  phoneNumber: user.phoneNumber ?? "",
  title: user.title ?? "",
  preset: "CUSTOM",
  modules: [...user.modules],
  staffId: "",
});

function requiredText(value: string, label: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return undefined;
}

function optionalText(value: string, label: string, max: number): string | undefined {
  return value.trim().length > max ? `${label} must be ${max} characters or fewer.` : undefined;
}

function validate(form: FormState, creating: boolean): Errors {
  const errors: Errors = {
    firstName: requiredText(form.firstName, "First name", NAME_MAX),
    lastName: requiredText(form.lastName, "Last name", NAME_MAX),
    phoneNumber: optionalText(form.phoneNumber, "Phone", PHONE_MAX),
    title: optionalText(form.title, "Title", TITLE_MAX),
    modules: form.modules.length === 0 ? "Tick at least one module." : undefined,
  };
  if (creating) {
    errors.email = requiredText(form.email, "Email", EMAIL_MAX);
    if (!errors.email && !EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address.";
  }
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v !== undefined)) as Errors;
}

function createRequest(form: FormState): CreateSchoolUserRequest {
  const phoneNumber = form.phoneNumber.trim();
  const title = form.title.trim();
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(title ? { title } : {}),
    modules: form.modules,
    ...(form.staffId ? { staffId: form.staffId } : {}),
  };
}

function updateRequest(userId: string, form: FormState): UpdateSchoolUserRequest {
  const phoneNumber = form.phoneNumber.trim();
  return {
    userId,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(phoneNumber ? { phoneNumber } : {}),
    title: form.title.trim() || null,
    modules: form.modules,
  };
}

interface SchoolUserDrawerProps {
  isOpen: boolean;
  /** Null creates a new office account; a user edits that account. */
  user: SchoolOfficeUser | null;
  linkableStaff: readonly LinkableStaff[];
  /** False while offline or showing the device list: changes need the server. */
  canChange: boolean;
  onClose: () => void;
  onCreated: (result: CreateSchoolUserResult) => void;
  onUpdated: (user: SchoolOfficeUser) => void;
}

/** Create or edit a School Office Staff account. Presets only pre-fill the
 * module checklist (and the title when it is empty). */
export function SchoolUserDrawer({
  isOpen,
  user,
  linkableStaff,
  canChange,
  onClose,
  onCreated,
  onUpdated,
}: SchoolUserDrawerProps) {
  const creating = user === null;
  const [form, setForm] = useState<FormState>(() => (user ? formFor(user) : emptyForm()));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(user ? formFor(user) : emptyForm());
    setErrors({});
    setServerError("");
  }, [isOpen, user]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const choosePreset = (id: PresetId) => {
    const preset = SCHOOL_MODULE_PRESETS.find((p) => p.id === id);
    setForm((prev) => ({
      ...prev,
      preset: id,
      modules: preset ? [...preset.modules] : [],
      title: preset && !prev.title.trim() ? preset.title : prev.title,
    }));
  };

  const submit = async () => {
    const found = validate(form, creating);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      if (user === null) {
        const res = await schoolUsersBridge.create(createRequest(form));
        onCreated(res.data);
      } else {
        const res = await schoolUsersBridge.update(updateRequest(user.id, form));
        onUpdated(res.data);
      }
    } catch (error) {
      setServerError(parseIpcError(error)?.message || "Couldn't save the account. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || !canChange;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={user === null ? "Add office user" : `Edit ${user.firstName} ${user.lastName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy} loading={saving}>
            {creating ? "Create account" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {serverError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="First name"
            aria-label="First name"
            required
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            error={errors.firstName}
          />
          <Input
            label="Last name"
            aria-label="Last name"
            required
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            error={errors.lastName}
          />
        </div>
        {creating && (
          <Input
            label="Email"
            aria-label="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            error={errors.email}
          />
        )}
        <Input
          label="Phone"
          aria-label="Phone"
          value={form.phoneNumber}
          onChange={(e) => set("phoneNumber", e.target.value)}
          error={errors.phoneNumber}
        />
        <Select
          label="Preset"
          aria-label="Preset"
          options={PRESET_OPTIONS}
          value={form.preset}
          onChange={(e) => choosePreset(e.target.value as PresetId)}
          helperText="A preset ticks the modules for a common job. You can change them after."
        />
        <Input
          label="Title"
          aria-label="Title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
        />
        <ModuleChecklist
          value={form.modules}
          onChange={(modules) => set("modules", modules)}
          error={errors.modules}
        />
        {creating && linkableStaff.length > 0 && (
          <Select
            label="Link to an existing staff member"
            aria-label="Link to an existing staff member"
            options={[
              { value: "", label: "Not linked" },
              ...linkableStaff.map((s) => ({
                value: s.id,
                label: `${s.firstName} ${s.lastName}${s.position ? ` — ${s.position}` : ""}`,
              })),
            ]}
            value={form.staffId}
            onChange={(e) => set("staffId", e.target.value)}
            helperText="Optional. Links the account to their staff record."
          />
        )}
      </div>
    </Drawer>
  );
}
