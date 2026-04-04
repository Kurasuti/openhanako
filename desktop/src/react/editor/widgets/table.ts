import { WidgetType } from '@codemirror/view';

export class TableWidget extends WidgetType {
  constructor(readonly source: string) { super(); }

  eq(other: TableWidget) { return this.source === other.source; }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-widget';

    const lines = this.source.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      wrapper.textContent = this.source;
      return wrapper;
    }

    const parseRow = (line: string) =>
      line.split('|').map(c => c.trim()).filter(c => c !== '');

    const headers = parseRow(lines[0]);
    // lines[1] is the separator row (---|---), skip it
    const bodyRows = lines.slice(2).map(parseRow);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      headTr.appendChild(th);
    }
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of bodyRows) {
      const tr = document.createElement('tr');
      for (let i = 0; i < headers.length; i++) {
        const td = document.createElement('td');
        td.textContent = row[i] ?? '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }
}
