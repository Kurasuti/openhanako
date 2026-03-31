/**
 * WidgetButtons — titlebar icons for pinned plugin widgets + plugin list + desk toggle.
 *
 * Renders to the left of the jian sidebar toggle, only when the current tab is 'chat'
 * and at least one widget-contributing plugin exists.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../stores';
import { resolvePluginTitle, resolvePluginIcon } from '../../utils/resolve-plugin-title';
import { openWidget, openDesk, pinWidget, unpinWidget } from '../../stores/plugin-ui-actions';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import s from './WidgetButtons.module.css';

interface MenuState { items: ContextMenuItem[]; position: { x: number; y: number } }

export function WidgetButtons() {
  const widgets = useStore(st => st.pluginWidgets);
  const pinnedWidgets = useStore(st => st.pinnedWidgets);
  const jianView = useStore(st => st.jianView);
  const currentTab = useStore(st => st.currentTab);
  const locale = useStore(st => st.locale);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [dropdownOpen]);

  // Right-click on pinned widget → unpin
  const handleContextPinned = useCallback((e: React.MouseEvent, pluginId: string, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      position: { x: e.clientX, y: e.clientY },
      items: [{ label: `取消固定「${title}」`, action: () => unpinWidget(pluginId) }],
    });
  }, []);

  if (currentTab !== 'chat' || widgets.length === 0) return null;

  const unpinnedWidgets = widgets.filter(w => !pinnedWidgets.includes(w.pluginId));

  return (
    <div className={s.container}>
      {/* Pinned widgets: individual buttons, right-click to unpin */}
      {pinnedWidgets.map(id => {
        const w = widgets.find(x => x.pluginId === id);
        if (!w) return null;
        const icon = resolvePluginIcon(w.icon, w.title, locale);
        const title = resolvePluginTitle(w.title, locale, w.pluginId);
        const active = jianView === `widget:${id}`;
        return (
          <button
            key={id}
            className={`${s.btn}${active ? ` ${s.active}` : ''}`}
            title={title}
            onClick={() => active ? openDesk() : openWidget(id)}
            onContextMenu={(e) => handleContextPinned(e, id, title)}
            dangerouslySetInnerHTML={icon.type === 'svg' ? { __html: icon.content } : undefined}
          >
            {icon.type === 'text' ? icon.content : null}
          </button>
        );
      })}

      {/* Dropdown for unpinned widgets — pin icon inline */}
      {unpinnedWidgets.length > 0 && (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button className={s.btn} title="插件" onClick={() => setDropdownOpen(!dropdownOpen)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          {dropdownOpen && (
            <div className={s.dropdown}>
              {unpinnedWidgets.map(w => {
                const title = resolvePluginTitle(w.title, locale, w.pluginId);
                return (
                  <div key={w.pluginId} className={s.dropdownRow}>
                    <button className={s.dropdownItem}
                      onClick={() => { openWidget(w.pluginId); setDropdownOpen(false); }}>
                      {title}
                    </button>
                    <button
                      className={s.pinBtn}
                      title="固定到标题栏"
                      onClick={(e) => { e.stopPropagation(); pinWidget(w.pluginId); setDropdownOpen(false); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4H7v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Desk toggle */}
      <button
        className={`${s.btn}${jianView === 'desk' ? ` ${s.active}` : ''}`}
        title="书桌"
        onClick={() => openDesk()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="4" rx="1"/><line x1="5" y1="11" x2="5" y2="20"/><line x1="19" y1="11" x2="19" y2="20"/>
        </svg>
      </button>

      {menu && <ContextMenu items={menu.items} position={menu.position} onClose={() => setMenu(null)} />}
    </div>
  );
}
