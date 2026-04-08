/**
 * InputContextMenu — 输入框全局右键菜单
 *
 * 监听 document 级别的 contextmenu 事件，当目标是 input/textarea 时
 * 弹出剪切 / 复制 / 粘贴 / 全选菜单，复用已有 ContextMenu 组件与样式。
 */

import { useState, useCallback, useEffect } from 'react';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';

declare function t(key: string): string;

const TEXT_INPUT_TYPES = new Set([
  'text', 'password', 'email', 'search', 'url', 'tel', 'number', '',
]);

function isTextInput(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  return false;
}

interface MenuState {
  position: { x: number; y: number };
  target: HTMLInputElement | HTMLTextAreaElement;
}

export function InputContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target;
      if (!isTextInput(target)) return;

      // 如果已有更具体的右键菜单（比如 desk 的），不拦截
      if ((target as HTMLElement).closest('[data-no-input-ctx]')) return;

      e.preventDefault();
      setMenu({ position: { x: e.clientX, y: e.clientY }, target });
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleClose = useCallback(() => setMenu(null), []);

  if (!menu) return null;

  const { target } = menu;
  const hasSelection = target.selectionStart !== target.selectionEnd;
  const hasContent = target.value.length > 0;
  const isReadonly = target.readOnly || target.disabled;

  const items: ContextMenuItem[] = [];

  if (!isReadonly) {
    items.push({
      label: t('ctx.cut'),
      action: () => {
        if (!hasSelection) return;
        document.execCommand('cut');
      },
    });
  }

  items.push({
    label: t('ctx.copy'),
    action: () => {
      if (!hasSelection) return;
      document.execCommand('copy');
    },
  });

  if (!isReadonly) {
    items.push({
      label: t('ctx.paste'),
      action: () => {
        target.focus();
        document.execCommand('paste');
      },
    });
  }

  if (hasContent) {
    items.push({ divider: true });
    items.push({
      label: t('ctx.selectAll'),
      action: () => {
        target.focus();
        target.select();
      },
    });
  }

  return (
    <ContextMenu
      items={items}
      position={menu.position}
      onClose={handleClose}
    />
  );
}
