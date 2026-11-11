"use client";

import { SCHOOL_MODULES, SCHOOL_MODULE_LABELS, type SchoolModule } from "@nemis-desktop/types";

interface ModuleChecklistProps {
  value: readonly SchoolModule[];
  onChange: (modules: SchoolModule[]) => void;
  disabled?: boolean;
  error?: string;
}

/** One checkbox per school module, in SCHOOL_MODULES order. The emitted list
 * keeps that order whatever order the boxes were ticked in. */
export function ModuleChecklist({ value, onChange, disabled, error }: ModuleChecklistProps) {
  const toggle = (module: SchoolModule) => {
    const next = value.includes(module) ? value.filter((m) => m !== module) : [...value, module];
    onChange(SCHOOL_MODULES.filter((m) => next.includes(m)));
  };

  return (
    <fieldset>
      <legend className="block text-small font-medium text-neutral-dark mb-2">Modules</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCHOOL_MODULES.map((module) => (
          <label
            key={module}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-slate-900"
              checked={value.includes(module)}
              disabled={disabled}
              onChange={() => toggle(module)}
            />
            {SCHOOL_MODULE_LABELS[module]}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-small text-error">{error}</p>}
    </fieldset>
  );
}
