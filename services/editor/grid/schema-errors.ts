/**
 * Editor grid schema error mapping.
 *
 * Responsibilities:
 * - Convert common schema mismatch errors into actionable messages.
 */
export function mapGridSchemaError(message: string): string {
  // Most common local/dev issue: migration not applied to the DB yet.
  if (
    /column .*spacing_x_value.* does not exist/i.test(message) ||
    /column .*spacing_y_value.* does not exist/i.test(message)
  ) {
    return 'Grid storage is not ready. Apply migration "db/012_project_grid_xy.sql" to your database.'
  }
  return message
}

