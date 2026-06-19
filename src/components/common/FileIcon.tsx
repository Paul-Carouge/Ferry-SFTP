import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  FileAudio,
  FileVideo,
  FileJson,
  FileCog,
  Link2,
} from "lucide-react";

const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "rs", "py", "go", "rb", "java", "c", "cpp", "h",
  "css", "html", "sh", "yml", "yaml", "toml", "php", "sql",
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "bz2", "7z", "rar", "xz"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "ogg", "m4a"]);
const VIDEO_EXT = new Set(["mp4", "mov", "mkv", "avi", "webm"]);
const TEXT_EXT = new Set(["txt", "md", "log", "csv"]);
const CONFIG_EXT = new Set(["conf", "ini", "env", "lock"]);

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function FileIcon({
  name,
  isDir,
  isSymlink,
  className = "size-4",
}: {
  name: string;
  isDir: boolean;
  isSymlink?: boolean;
  className?: string;
}) {
  if (isSymlink) return <Link2 className={`${className} text-foreground-muted`} />;
  if (isDir) return <Folder className={`${className} text-accent`} />;

  const ext = extOf(name);
  if (ext === "json") return <FileJson className={`${className} text-warning`} />;
  if (CODE_EXT.has(ext)) return <FileCode className={`${className} text-accent`} />;
  if (IMAGE_EXT.has(ext)) return <FileImage className={`${className} text-success`} />;
  if (ARCHIVE_EXT.has(ext)) return <FileArchive className={`${className} text-foreground-muted`} />;
  if (AUDIO_EXT.has(ext)) return <FileAudio className={`${className} text-foreground-muted`} />;
  if (VIDEO_EXT.has(ext)) return <FileVideo className={`${className} text-foreground-muted`} />;
  if (CONFIG_EXT.has(ext)) return <FileCog className={`${className} text-foreground-muted`} />;
  if (TEXT_EXT.has(ext)) return <FileText className={`${className} text-foreground-muted`} />;
  return <File className={`${className} text-foreground-muted`} />;
}
