"use client";

import React, { useState } from "react";

export type AvatarRole =
  | "student"
  | "teacher"
  | "parent"
  | "deo"
  | "school"
  | "generic";

export interface AvatarProps {
  src?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: AvatarRole;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  /** Fill the nearest `relative` ancestor as a rectangle instead of a fixed circular size (like next/image `fill`). */
  fill?: boolean;
  className?: string;
  alt?: string;
}

// Every consuming app's public/ must ship these role-specific fallback assets
// at the same paths (see apps/portal-web/public and apps/SIS/public).
const ROLE_FALLBACKS: Record<AvatarRole, string> = {
  student: "/student-fallback.jpg",
  teacher: "/teacher-fallback.jpg",
  parent: "/parent-fallback.jpg",
  deo: "/deo-fallback.jpg",
  school: "/school-fallback.jpg",
  generic: "/avatar-placeholder.jpg",
};

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-indigo-500",
];

function getAvatarColor(name: string): string {
  return name
    ? (AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] ?? "bg-slate-500")
    : "bg-slate-500";
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

const SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg" | "xl", string> = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-base",
  xl: "w-24 h-24 text-xl",
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  firstName,
  lastName,
  role = "generic",
  size = "md",
  fill = false,
  className = "",
  alt,
}) => {
  const [errored, setErrored] = useState(false);

  const sizeStyle =
    !fill && typeof size === "number"
      ? { width: size, height: size }
      : undefined;
  const sizeClass = fill || typeof size === "number" ? "" : SIZE_CLASSES[size];
  const imgShapeClass = fill
    ? "absolute inset-0 w-full h-full object-cover"
    : "rounded-full object-cover flex-shrink-0";
  const initialsShapeClass = fill
    ? "absolute inset-0 w-full h-full"
    : "rounded-full flex-shrink-0";

  if (!src) {
    const initials = getInitials(firstName, lastName);
    if (!initials) {
      return (
        <img
          src={ROLE_FALLBACKS[role]}
          alt={alt ?? "Profile"}
          style={sizeStyle}
          className={`${sizeClass} ${imgShapeClass} ${className}`}
        />
      );
    }

    return (
      <div
        style={sizeStyle}
        className={`${sizeClass} ${initialsShapeClass} flex items-center justify-center text-white font-bold ${getAvatarColor(
          firstName ?? "",
        )} ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={errored ? ROLE_FALLBACKS[role] : src}
      alt={alt ?? (`${firstName ?? ""} ${lastName ?? ""}`.trim() || "Profile")}
      onError={() => setErrored(true)}
      style={sizeStyle}
      className={`${sizeClass} ${imgShapeClass} ${className}`}
    />
  );
};
