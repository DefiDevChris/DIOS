/**
 * Renders an email template by replacing `{variableName}` placeholders
 * with the corresponding values from the provided variables object.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
}
