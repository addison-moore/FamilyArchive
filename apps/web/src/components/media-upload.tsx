"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonClass } from "@/components/form";

interface UploadState {
  name: string;
  progress: number;
  status: "uploading" | "done" | "duplicate" | "error";
  message?: string;
  mediaId?: string;
  duplicateOf?: string;
}

/** Multi-file uploader with per-file progress. */
export function MediaUpload({ treeId, accept }: { treeId: string; accept: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const uploadFile = (file: File, index: number) =>
    new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/trees/${treeId}/media`);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, progress } : u)));
        }
      };
      xhr.onload = () => {
        let body: { mediaId?: string; error?: string; duplicateOf?: string } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // non-JSON error body
        }
        setUploads((prev) =>
          prev.map((u, i) => {
            if (i !== index) return u;
            if (xhr.status === 201)
              return { ...u, progress: 100, status: "done", mediaId: body.mediaId };
            if (xhr.status === 409)
              return {
                ...u,
                status: "duplicate",
                message: body.error,
                duplicateOf: body.duplicateOf,
              };
            return {
              ...u,
              status: "error",
              message: body.error ?? `Upload failed (${xhr.status})`,
            };
          }),
        );
        resolve();
      };
      xhr.onerror = () => {
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index ? { ...u, status: "error", message: "Network error" } : u,
          ),
        );
        resolve();
      };
      xhr.send(file);
    });

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const offset = uploads.length;
    setUploads((prev) => [
      ...prev,
      ...files.map((file) => ({ name: file.name, progress: 0, status: "uploading" as const })),
    ]);
    for (const [i, file] of files.entries()) {
      await uploadFile(file, offset + i);
    }
    router.refresh();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(event) => {
          // Copy before clearing: `files` is live, and clearing the value empties
          // it in place. The clear is what lets the same file be picked again
          // after a failed or finished upload, since a file input only fires
          // `change` when the selection differs from its current value.
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void onFiles(files);
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className={buttonClass}>
        Upload media
      </button>
      {uploads.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {uploads.map((upload, index) => (
            <li key={index} className="flex items-center gap-3 text-sm">
              <span className="max-w-56 truncate">{upload.name}</span>
              {upload.status === "uploading" && (
                <span className="h-1.5 w-32 overflow-hidden rounded bg-archive-100">
                  <span
                    className="block h-full bg-accent-600 transition-all"
                    style={{ width: `${upload.progress}%` }}
                  />
                </span>
              )}
              {upload.status === "done" && upload.mediaId && (
                <Link
                  href={`/trees/${treeId}/media/${upload.mediaId}`}
                  className="text-accent-600 hover:underline"
                >
                  uploaded ✓
                </Link>
              )}
              {upload.status === "duplicate" && (
                <span className="text-warn">
                  duplicate{" "}
                  {upload.duplicateOf && (
                    <Link
                      href={`/trees/${treeId}/media/${upload.duplicateOf}`}
                      className="text-accent-600 hover:underline"
                    >
                      (view existing)
                    </Link>
                  )}
                </span>
              )}
              {upload.status === "error" && <span className="text-danger">{upload.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
