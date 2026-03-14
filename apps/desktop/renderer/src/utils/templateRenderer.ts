/**
 * Variables available for substitution in email templates.
 */
export interface TemplateVariables {
  agencyContact: string;
  agencyName: string;
  operatorName: string;
  inspectionDate: string;
  invoiceNumber: string;
  totalAmount: string;
  signature: string;
}

/**
 * Renders an email template by replacing `{variableName}` placeholders
 * with the corresponding values from the provided variables object.
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  let result = template;

  const entries = Object.entries(variables) as Array<[string, string]>;
  for (const [key, value] of entries) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
}
