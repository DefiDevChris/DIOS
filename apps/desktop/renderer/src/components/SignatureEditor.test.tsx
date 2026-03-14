import { render, screen } from '@testing-library/react'
import SignatureEditor from './SignatureEditor'

beforeAll(() => {
  document.queryCommandState = vi.fn(() => false)
  document.execCommand = vi.fn(() => true)
})

describe('SignatureEditor', () => {
  it('renders editor and preview sections', () => {
    const { container } = render(<SignatureEditor value="" onChange={vi.fn()} />)
    const grid = container.querySelector('.grid')
    expect(grid).toBeInTheDocument()
    expect(grid?.children).toHaveLength(2)
  })

  it('renders "Editor" and "Preview" labels', () => {
    render(<SignatureEditor value="" onChange={vi.fn()} />)
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('preview section contains the HTML value via dangerouslySetInnerHTML', () => {
    const html = '<strong>John Doe</strong><br/>Inspector'
    render(<SignatureEditor value={html} onChange={vi.fn()} />)
    const previewLabel = screen.getByText('Preview')
    const previewContainer = previewLabel.closest('div')!
    const previewDiv = previewContainer.querySelector('div[class*="min-h"]')!
    expect(previewDiv.innerHTML).toContain('<strong>John Doe</strong>')
    expect(previewDiv.innerHTML).toContain('Inspector')
  })

  it('toolbar buttons render (Bold, Italic, Underline, Insert Link)', () => {
    render(<SignatureEditor value="" onChange={vi.fn()} />)

    const boldBtn = screen.getByTitle('Bold')
    const italicBtn = screen.getByTitle('Italic')
    const underlineBtn = screen.getByTitle('Underline')
    const linkBtn = screen.getByTitle('Insert Link')

    expect(boldBtn).toBeInTheDocument()
    expect(italicBtn).toBeInTheDocument()
    expect(underlineBtn).toBeInTheDocument()
    expect(linkBtn).toBeInTheDocument()
  })
})
