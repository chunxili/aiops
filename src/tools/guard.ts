const readOnlyPrefixes = ["query_", "list_", "get_", "describe_"];
const mutatingPrefixes = [
  "create_",
  "update_",
  "delete_",
  "put_",
  "patch_",
  "start_",
  "stop_",
  "restart_",
  "scale_",
  "apply_",
];

export class ReadOnlyViolation extends Error {}

export function assertReadOnlyTool(toolName: string): void {
  const isMutation = mutatingPrefixes.some((prefix) => toolName.startsWith(prefix));
  const isReadOnly = readOnlyPrefixes.some((prefix) => toolName.startsWith(prefix));

  if (isMutation || !isReadOnly) {
    throw new ReadOnlyViolation(`Tool '${toolName}' is not allowed by the read-only guard.`);
  }
}
