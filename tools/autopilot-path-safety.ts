import fs from "node:fs";
import path from "node:path";

export function pathIsInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function realPathIsInside(parent: string, child: string): boolean {
  return pathIsInside(fs.realpathSync(parent), fs.realpathSync(child));
}

export function isSymlinkPath(filePath: string): boolean {
  return fs.lstatSync(filePath).isSymbolicLink();
}
