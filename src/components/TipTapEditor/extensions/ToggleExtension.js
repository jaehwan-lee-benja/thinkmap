import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Toggle Extension for TipTap
 * Notion-style collapsible blocks with children
 */
export const Toggle = Node.create({
  name: 'toggle',

  group: 'block',

  content: 'block+',

  defining: true,

  addAttributes() {
    return {
      isOpen: {
        default: true,
        parseHTML: element => element.getAttribute('data-is-open') === 'true',
        renderHTML: attributes => {
          return {
            'data-is-open': attributes.isOpen,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle',
        'data-is-open': node.attrs.isOpen,
        class: 'toggle-block',
      }),
      [
        'div',
        { class: 'toggle-header' },
        [
          'button',
          {
            class: 'toggle-button',
            contenteditable: 'false',
            'data-toggle-button': 'true',
          },
          node.attrs.isOpen ? '▼' : '▶',
        ],
        ['div', { class: 'toggle-content-wrapper' }, 0],
      ],
      [
        'div',
        {
          class: node.attrs.isOpen ? 'toggle-children open' : 'toggle-children closed',
        },
        // children will be rendered here by TipTap
      ],
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.classList.add('toggle-block')
      dom.setAttribute('data-is-open', node.attrs.isOpen)

      // Header (toggle button + content)
      const header = document.createElement('div')
      header.classList.add('toggle-header')

      // Toggle button
      const button = document.createElement('button')
      button.classList.add('toggle-button')
      button.contentEditable = 'false'
      button.textContent = node.attrs.isOpen ? '▼' : '▶'
      button.addEventListener('click', () => {
        if (typeof getPos === 'function') {
          const pos = getPos()
          editor.commands.updateAttributes('toggle', {
            isOpen: !node.attrs.isOpen,
          })
        }
      })

      // Content area
      const contentWrapper = document.createElement('div')
      contentWrapper.classList.add('toggle-content-wrapper')

      header.appendChild(button)
      header.appendChild(contentWrapper)

      // Children area
      const childrenWrapper = document.createElement('div')
      childrenWrapper.classList.add('toggle-children')
      childrenWrapper.classList.add(node.attrs.isOpen ? 'open' : 'closed')

      dom.appendChild(header)
      dom.appendChild(childrenWrapper)

      return {
        dom,
        contentDOM: childrenWrapper,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'toggle') {
            return false
          }

          // Update button text
          button.textContent = updatedNode.attrs.isOpen ? '▼' : '▶'

          // Update children visibility
          childrenWrapper.className = updatedNode.attrs.isOpen
            ? 'toggle-children open'
            : 'toggle-children closed'

          dom.setAttribute('data-is-open', updatedNode.attrs.isOpen)

          return true
        },
      }
    }
  },

  addCommands() {
    return {
      setToggle: () => ({ commands }) => {
        return commands.setNode(this.name)
      },
      toggleToggle: () => ({ commands, editor }) => {
        const { state } = editor
        const { $from } = state.selection
        const node = $from.parent

        if (node.type.name === 'toggle') {
          return commands.updateAttributes('toggle', {
            isOpen: !node.attrs.isOpen,
          })
        }

        return false
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-t': () => this.editor.commands.setToggle(),
    }
  },
})
