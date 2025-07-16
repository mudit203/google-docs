import { Node } from '@tiptap/core'

export const PageBreak = Node.create({
  name: 'pageBreak',

  group: 'block',

  parseHTML() {
    return [
      {
        tag: 'div.page-break',
      },
      {
        tag: 'hr',
        getAttrs: (element) => {
          // Convert hr tags from mammoth to page breaks
          return {}
        }
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', {
      ...HTMLAttributes,
      class: 'page-break',
      style: 'border-top: 2px dashed #ccc; margin: 2rem 0; padding: 1rem 0; text-align: center; color: #666; font-size: 0.875rem; position: relative;'
    }, 'Page Break']
  },

  addCommands() {
    return {
      setPageBreak: () => ({ commands }: any) => {
        return commands.insertContent('<div class="page-break">Page Break</div>')
      },
    } as any
  },
})