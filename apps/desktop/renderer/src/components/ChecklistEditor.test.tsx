import { render, screen, fireEvent } from '@testing-library/react'
import ChecklistEditor from './ChecklistEditor'

const defaultProps = {
  title: 'Prep Checklist',
  enabled: true,
  onToggle: vi.fn(),
  items: [] as string[],
  onItemsChange: vi.fn(),
}

function renderEditor(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, onToggle: vi.fn(), onItemsChange: vi.fn(), ...overrides }
  return { ...render(<ChecklistEditor {...props} />), props }
}

describe('ChecklistEditor', () => {
  it('renders title', () => {
    renderEditor()
    expect(screen.getByText('Prep Checklist')).toBeInTheDocument()
  })

  it('shows Enabled and Disabled toggle buttons', () => {
    renderEditor()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('clicking Enabled calls onToggle(true)', () => {
    const { props } = renderEditor({ enabled: false })
    fireEvent.click(screen.getByText('Enabled'))
    expect(props.onToggle).toHaveBeenCalledWith(true)
  })

  it('clicking Disabled calls onToggle(false)', () => {
    const { props } = renderEditor({ enabled: true })
    fireEvent.click(screen.getByText('Disabled'))
    expect(props.onToggle).toHaveBeenCalledWith(false)
  })

  it('when disabled, shows "Checklist disabled" message', () => {
    renderEditor({ enabled: false })
    expect(screen.getByText('Checklist disabled for this agency')).toBeInTheDocument()
  })

  it('when enabled with no items, shows "No checklist items"', () => {
    renderEditor({ enabled: true, items: [] })
    expect(screen.getByText('No checklist items')).toBeInTheDocument()
  })

  it('when enabled with items, renders each item input', () => {
    renderEditor({ enabled: true, items: ['Check records', 'Verify labels'] })
    const inputs = screen.getAllByPlaceholderText('Checklist item...')
    expect(inputs).toHaveLength(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('Check records')
    expect((inputs[1] as HTMLInputElement).value).toBe('Verify labels')
  })

  it('Add Item button calls onItemsChange with new empty item', () => {
    const { props } = renderEditor({ enabled: true, items: ['Existing'] })
    fireEvent.click(screen.getByText('Add Item'))
    expect(props.onItemsChange).toHaveBeenCalledWith(['Existing', ''])
  })

  it('delete button removes item', () => {
    const { props } = renderEditor({ enabled: true, items: ['Item A', 'Item B', 'Item C'] })
    const removeButtons = screen.getAllByTitle('Remove item')
    fireEvent.click(removeButtons[1])
    expect(props.onItemsChange).toHaveBeenCalledWith(['Item A', 'Item C'])
  })

  it('move up reorders items', () => {
    const { props } = renderEditor({ enabled: true, items: ['First', 'Second', 'Third'] })
    const moveUpButtons = screen.getAllByTitle('Move up')
    fireEvent.click(moveUpButtons[1])
    expect(props.onItemsChange).toHaveBeenCalledWith(['Second', 'First', 'Third'])
  })

  it('move down reorders items', () => {
    const { props } = renderEditor({ enabled: true, items: ['First', 'Second', 'Third'] })
    const moveDownButtons = screen.getAllByTitle('Move down')
    fireEvent.click(moveDownButtons[0])
    expect(props.onItemsChange).toHaveBeenCalledWith(['Second', 'First', 'Third'])
  })
})
