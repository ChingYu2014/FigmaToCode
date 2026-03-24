"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Check, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import type { Framework } from "types";
import JSZip from "jszip";

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

  const handleDownload = async () => {
    const sanitizedName = filename.trim() || "figma-export";
    setIsExporting(true);

    try {
      // Request PNG export
      let pngData: number[] | null = null;
      if (onRequestExportPng) {
        pngData = await onRequestExportPng();
        console.log("[UI] PNG data received:", pngData ? pngData.length + " bytes" : "null");
      }

      // Create ZIP with both files
      const zip = new JSZip();
      zip.file(`${sanitizedName}${extension}`, value);

      if (pngData) {
        const pngBytes = new Uint8Array(pngData);
        zip.file(`${sanitizedName}.png`, pngBytes);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download ZIP
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizedName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
              isDownloaded
                ? "opacity-0 scale-75"
                : "opacity-100 scale-100"
            }`}
          >
            <Download className="h-4 w-4 text-foreground" />
          </span>
          <span
            className={`absolute inset-0 transition-all duration-200 ${
              isDownloaded
                ? "opacity-100 scale-100"
                : "opacity-0 scale-75"
            }`}
          >
            <Check className="h-4 w-4 text-primary-foreground" />
          </span>
        </div>
        <span className="font-medium">
          {isDownloaded ? "Downloaded" : "Download"}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-card border rounded-lg shadow-lg p-3 flex flex-col gap-2">
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
            <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
              .zip
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contains: {filename.trim() || "figma-export"}{extension} + .png
          </p>
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
                Download ZIP
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
