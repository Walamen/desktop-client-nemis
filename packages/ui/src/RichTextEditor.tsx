"use client";

import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";

export interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  label?: string;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Mouse-down (not click) so the editor selection isn't lost to the
      // toolbar stealing focus before the command runs.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className={`min-w-[26px] px-1.5 py-1 rounded text-xs font-bold transition-colors ${
        active ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-200"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

/** Rich-text editor for freeform instructions (assignments, announcements,
 * etc). Toolbar uses plain text/symbol labels rather than an icon set —
 * @nemis-desktop/ui deliberately has no icon dependency; every other
 * component here takes icons as a caller-supplied ReactNode instead. */
export function RichTextEditor({
  content,
  onChange,
  placeholder = "Write here…",
  editable = true,
  label,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    // Avoids a Next.js SSR hydration mismatch — Tiptap's initial render
    // depends on browser APIs.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-secondary underline cursor-pointer" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "outline-none min-h-[160px] px-4 py-3 prose prose-sm max-w-none",
      },
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-small font-medium text-neutral-dark mb-2">{label}</label>
      )}
      <div
        className={`border  overflow-hidden border-border ${editable ? "bg-white" : "bg-gray-50"}`}
      >
        {editable && (
          <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-gray-50 border-b border-border">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              title="Bold"
            >
              B
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              title="Italic"
            >
              <span className="italic">I</span>
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive("underline")}
              title="Underline"
            >
              <span className="underline">U</span>
            </ToolbarButton>

            <div className="w-px h-4 bg-gray-300 mx-1" />

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              active={editor.isActive("heading", { level: 1 })}
              title="Heading 1"
            >
              H1
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive("heading", { level: 2 })}
              title="Heading 2"
            >
              H2
            </ToolbarButton>

            <div className="w-px h-4 bg-gray-300 mx-1" />

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
              title="Bullet list"
            >
              •
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
              title="Numbered list"
            >
              1.
            </ToolbarButton>

            <div className="w-px h-4 bg-gray-300 mx-1" />

            <ToolbarButton onClick={setLink} active={editor.isActive("link")} title="Add / remove link">
              Link
            </ToolbarButton>

            <div className="w-px h-4 bg-gray-300 mx-1" />

            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo"
            >
              ↺
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo"
            >
              ↻
            </ToolbarButton>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
