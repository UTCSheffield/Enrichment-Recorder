/* CSV decoding and mapping, shared by the import UI and parser regression tests. */
(function (root) {
    const fields = {
        name: 'Full name', first_name: 'First name', last_name: 'Last name',
        year_group: 'Year group', pp: 'Pupil Premium (PP)', fsm_ever: 'FSM Ever',
        gender: 'Gender', sen_status: 'SEN Status'
    };
    function parse(text) {
        text = text.replace(/^\uFEFF/, '');
        const records = [];
        let cells = [], value = '', quoted = false, closed = false, line = 1, start = 1;
        const finishCell = () => { cells.push(value.trim()); value = ''; closed = false; };
        const finishRow = () => { finishCell(); if (cells.some(cell => cell !== '')) records.push({ cells, line: start }); cells = []; };
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (quoted) {
                if (char === '"') {
                    if (text[i + 1] === '"') { value += '"'; i++; }
                    else { quoted = false; closed = true; }
                } else {
                    if (char === '\r' || char === '\n') {
                        if (char === '\r' && text[i + 1] === '\n') i++;
                        value += '\n'; line++;
                    } else value += char;
                }
            } else if (char === ',') finishCell();
            else if (char === '\r' || char === '\n') {
                finishRow(); if (char === '\r' && text[i + 1] === '\n') i++;
                line++; start = line;
            } else if (char === '"' && !value.trim() && !closed) { value = ''; quoted = true; }
            else if (char === '"' || (closed && char.trim())) throw new Error(`Row ${start}: invalid CSV quoting`);
            else if (!closed) value += char;
        }
        if (quoted) throw new Error(`Row ${start}: unclosed quoted field`);
        if (value || cells.length || closed) finishRow();
        if (!records.length) throw new Error('The CSV is empty');
        return records;
    }
    const normaliseHeader = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases = {
        name: ['name', 'fullname', 'studentname', 'pupilname'],
        first_name: ['firstname', 'forename', 'forenames', 'givenname'],
        last_name: ['lastname', 'surname', 'familyname'],
        year_group: ['year', 'yeargroup', 'schoolyear'], pp: ['pp', 'pupilpremium', 'pupilpremiumindicator'],
        fsm_ever: ['fsm', 'fsmever', 'fsmever6'], gender: ['gender', 'sex'], sen_status: ['sen', 'senstatus']
    };
    function infer(records, hasHeader) {
        const headers = records[0].cells.map(normaliseHeader);
        if (hasHeader === undefined) hasHeader = headers.some(h => Object.values(aliases).some(list => list.includes(h)));
        const mapping = Object.fromEntries(Object.keys(fields).map(field => [field, -1]));
        if (hasHeader) {
            for (const [field, names] of Object.entries(aliases)) mapping[field] = headers.findIndex(h => names.includes(h));
        } else {
            mapping.name = 0;
            if (records[0].cells.length > 1) mapping.year_group = records[0].cells.length - 1;
            if (records[0].cells.length === 3) {
                mapping.name = -1; mapping.last_name = 0; mapping.first_name = 1;
            }
        }
        return { hasHeader, mapping, nameOrder: hasHeader ? 'first_last' : 'last_first' };
    }
    function mapRows(records, config) {
        const {mapping, hasHeader, nameOrder} = config;
        if (mapping.name < 0 && (mapping.first_name < 0 || mapping.last_name < 0)) throw new Error('Map Full name, or both First name and Last name');
        const rows = records.slice(hasHeader ? 1 : 0).map(record => {
            const cell = field => {
                const index = Number(mapping[field]);
                if (index < 0) return undefined;
                if (index >= record.cells.length) throw new Error(`Row ${record.line}: missing column for ${fields[field]}`);
                return record.cells[index];
            };
            let name;
            if (mapping.name >= 0) {
                name = cell('name');
                if (name.includes(',')) {
                    const [last, ...first] = name.split(','); name = `${first.join(',').trim()} ${last.trim()}`;
                } else if (nameOrder === 'last_first') {
                    const [last, ...first] = name.split(/\s+/); name = `${first.join(' ')} ${last}`;
                }
            } else {
                if (!cell('first_name') || !cell('last_name')) throw new Error(`Row ${record.line}: first name and last name are required`);
                name = `${cell('first_name')} ${cell('last_name')}`;
            }
            if (!name.trim()) throw new Error(`Row ${record.line}: name required`);
            const row = { row_number: record.line, name: name.trim(), year_group: cell('year_group') ?? '9' };
            for (const field of ['pp', 'fsm_ever', 'gender', 'sen_status']) {
                const value = cell(field); if (value !== undefined) row[field] = value;
            }
            return row;
        });
        if (!rows.length) throw new Error('There are no student rows to import');
        return rows;
    }
    const api = { parse, infer, mapRows, fields };
    if (typeof module !== 'undefined') module.exports = api;
    else root.StudentCsv = api;
})(typeof window !== 'undefined' ? window : globalThis);
