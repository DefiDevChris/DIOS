import { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Link, Underline } from 'lucide-react';

interface SignatureEditorProps {
  value: string;
  onChange: (html: string) => void;
}

type FormatCommand = 'bold' | 'italic' | 'underline';

function isFormatActive(command: FormatCommand): boolean {
  return document.queryCommandState(command);
}

export default function SignatureEditor({ value, onChange }: SignatureEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editor.innerHTML);
  }, [onChange]);

  const applyFormat = useCallback((command: FormatCommand) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    handleInput();
  }, [handleInput]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Enter URL:');
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand('createLink', false, url);
    handleInput();
  }, [handleInput]);

  const toolbarButtons = [
    { command: 'bold' as FormatCommand, icon: Bold, label: 'Bold' },
    { command: 'italic' as FormatCommand, icon: Italic, label: 'Italic' },
    { command: 'underline' as FormatCommand, icon: Underline, label: 'Underline' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
          Editor
        </label>

        <div className="flex gap-1 mb-2 border-b border-stone-100 pb-2">
          {toolbarButtons.map(({ command, icon: Icon, label }) => (
            <button
              key={command}
              type="button"
              title={label}
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat(command);
              }}
              className={`px-2 py-1 rounded text-sm font-bold hover:bg-stone-100 transition-colors ${
                isFormatActive(command) ? 'bg-stone-200' : ''
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
          <button
            type="button"
            title="Insert Link"
            onMouseDown={(e) => {
              e.preventDefault();
              insertLink();
            }}
            className="px-2 py-1 rounded text-sm font-bold hover:bg-stone-100 transition-colors"
          >
            <Link size={16} />
          </button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          className="min-h-[120px] bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
          Preview
        </label>

        <div
          className="min-h-[120px] bg-white border border-stone-100 rounded-xl p-4 text-sm"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    </div>
  );
}
