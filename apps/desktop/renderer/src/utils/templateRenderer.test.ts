import { renderTemplate } from './templateRenderer'

describe('renderTemplate', () => {
  it('replaces a single variable', () => {
    const result = renderTemplate('Hello {name}!', { name: 'Chris' })
    expect(result).toBe('Hello Chris!')
  })

  it('replaces multiple different variables', () => {
    const result = renderTemplate(
      'Dear {contact}, your invoice #{invoiceNumber} is due on {dueDate}.',
      {
        contact: 'Jane Doe',
        invoiceNumber: 'INV-001',
        dueDate: '2026-04-01',
      }
    )
    expect(result).toBe('Dear Jane Doe, your invoice #INV-001 is due on 2026-04-01.')
  })

  it('leaves unmatched placeholders intact when variable is missing', () => {
    const result = renderTemplate('Hello {name}, your code is {code}.', {
      name: 'Chris',
    })
    expect(result).toBe('Hello Chris, your code is {code}.')
  })

  it('returns empty string for an empty template', () => {
    const result = renderTemplate('', { name: 'Chris' })
    expect(result).toBe('')
  })

  it('replaces repeated occurrences of the same variable', () => {
    const result = renderTemplate('{x} and {x} and {x}', { x: 'A' })
    expect(result).toBe('A and A and A')
  })

  it('returns the template unchanged when no variables are provided', () => {
    const result = renderTemplate('Hello {name}!', {})
    expect(result).toBe('Hello {name}!')
  })

  it('handles variable values that contain special regex characters', () => {
    const result = renderTemplate('Price: {amount}', {
      amount: '$100.00 (USD)',
    })
    expect(result).toBe('Price: $100.00 (USD)')
  })

  it('handles a template with no placeholders', () => {
    const result = renderTemplate('No placeholders here.', { foo: 'bar' })
    expect(result).toBe('No placeholders here.')
  })

  it('handles variable value that is an empty string', () => {
    const result = renderTemplate('Value: {val}', { val: '' })
    expect(result).toBe('Value: ')
  })

  it('handles multiple variables where one is missing', () => {
    const result = renderTemplate('{a} {b} {c}', { a: 'X', c: 'Z' })
    expect(result).toBe('X {b} Z')
  })
})
