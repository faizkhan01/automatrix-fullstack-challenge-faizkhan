/** `%value%` for a LIKE, with the user's own `%`, `_` and `\` matched literally. */
export function likeContains(value) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
