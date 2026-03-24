"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Check, Loader2, Folder, FolderOpen } from "lucide-react";
import { cn } from "../lib/utils";
import type { Framework } from "types";
import JSZip from "jszip";

// File System Access API types (not in default TS lib)
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    getFileHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemFileHandle>;
  }
  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }
  interface FileSystemWritableFileStream {
    write(data: BufferSource | Blob | string): Promise<void>;
    close(): Promise<void>;
  }
}

interface DownloadButtonProps {
  value: string;
  selectedFramework: Framework;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onRequestExportPng?: () => Promise<number[] | null>;
}

const frameworkExtensions: Record<Framework, string> = {
  HTML: ".html",
  Tailwind: ".html",
  Flutter: ".dart",
  SwiftUI: ".swift",
  Compose: ".kt",
};

export function DownloadButton({
  value,
  selectedFramework,
  className,
  onMouseEnter,
  onMouseLeave,
  onRequestExportPng,
}: DownloadButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filename, setFilename] = useState("figma-export");
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderSupported] = useState(() => typeof window !== "undefined" && !!window.showDirectoryPicker);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const extension = frameworkExtensions[selectedFramework] ?? ".html";

  useEffect(() => {
    if (isDownloaded) {
      const timer = setTimeout(() => setIsDownloaded(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isDownloaded]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelectFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker!({ mode: "readwrite" });
      setDirHandle(handle);
      console.log("[UI] Folder selected:", handle.name);
    } catch (e: any) {
      // User cancelled picker
      if (e?.name !== "AbortError") {
        console.error("[UI] showDirectoryPicker error:", e);
      }
    }
  };

  const saveToFolder = async (
    sanitizedName: string,
    pngData: number[] | null,
  ) => {
    if (!dirHandle) return;

    // Write code file
    const codeFile = await dirHandle.getFileHandle(`${sanitizedName}${extension}`, { create: true });
    const codeWritable = await codeFile.createWritable();
    await codeWritable.write(value);
    await codeWritable.close();
    console.log("[UI] Code file saved to folder");

    // Write PNG file
    if (pngData) {
      const pngFile = await dirHandle.getFileHandle(`${sanitizedName}.png`, { create: true });
      const pngWritable = await pngFile.createWritable();
      await pngWritable.write(new Uint8Array(pngData));
      await pngWritable.close();
      console.log("[UI] PNG file saved to folder");
    }
  };

  const saveAsZip = async (sanitizedName: string, pngData: number[] | null) => {
    const zip = new JSZip();
    zip.file(`${sanitizedName}${extension}`, value);
    if (pngData) {
      zip.file(`${sanitizedName}.png`, new Uint8Array(pngData));
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizedName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    const sanitizedName = filename.trim() || "figma-export";
    setIsExporting(true);

    try {
      // Request PNG export first
      let pngData: number[] | null = null;
      if (onRequestExportPng) {
        pngData = await onRequestExportPng();
        console.log("[UI] PNG data received:", pngData ? pngData.length + " bytes" : "null");
      }

      if (dirHandle) {
        // Save directly to folder
        await saveToFolder(sanitizedName, pngData);
      } else {
        // Fallback: ZIP download
        await saveAsZip(sanitizedName, pngData);
      }

      setIsDownloaded(true);
      setIsOpen(false);
    } catch (e) {
      console.error("[UI] Download error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isExporting) {
      handleDownload();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          "inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-300",
          isDownloaded
            ? "bg-primary text-primary-foreground"
            : "bg-neutral-100 dark:bg-neutral-700 dark:hover:bg-muted-foreground/30 text-foreground",
          className,
          "relative",
        )}
        aria-label={isDownloaded ? "Downloaded!" : "Download file"}
      >
        <div className="relative h-4 w-4 mr-1.5">
          <span
            className={`absolute inset-0 transition-all duration-200 ${
              isDownloaded ? "opacity-0 scale-75" : "opacity-100 scale-100"
            }`}
          >
            <Download className="h-4 w-4 text-foreground" />
          </span>
          <span
            className={`absolute inset-0 transition-all duration-200 ${
              isDownloaded ? "opacity-100 scale-100" : "opacity-0 scale-75"
            }`}
          >
            <Check className="h-4 w-4 text-primary-foreground" />
          </span>
        </div>
        <span className="font-medium">
          {isDownloaded ? "Saved!" : "Download"}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-card border rounded-lg shadow-lg p-3 flex flex-col gap-2">
          {/* Folder selector (only shown if API is supported) */}
          {folderSupported && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Save to Folder
              </label>
              <button
                onClick={handleSelectFolder}
                className="flex items-center gap-2 px-2 py-1.5 text-sm border rounded-md bg-background text-foreground hover:bg-muted transition-colors text-left"
              >
                {dirHandle ? (
                  <>
                    <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
                    <span className="truncate text-xs">{dirHandle.name}</span>
                  </>
                ) : (
                  <>
                    <Folder className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-gray-400 text-xs">Click to select folder...</span>
                  </>
                )}
              </button>
              {!dirHandle && (
                <p className="text-xs text-gray-400">
                  Or leave empty to download as ZIP
                </p>
              )}
            </div>
          )}

          {/* Filename input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Filename
            </label>
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-0 px-2 py-1.5 text-sm border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="figma-export"
                disabled={isExporting}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {dirHandle ? extension : ".zip"}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {dirHandle
                ? `Saves: ${filename.trim() || "figma-export"}${extension} + .png → ${dirHandle.name}/`
                : `Contains: ${filename.trim() || "figma-export"}${extension} + .png`}
            </p>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                {dirHandle ? "Save to Folder" : "Download ZIP"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
