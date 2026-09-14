/* Event roster rules. Selections use student IDs; labels are always rendered as text. */
(function(root) {
    const arrays = ['year_groups','mandatory_year_groups','manual_student_ids','excluded_student_ids','included_student_ids'];
    function calculate(students, rules) {
        return students.filter(s => rules.year_groups.includes(Number(s.year_group))).flatMap(s => {
            const id = Number(s.id);
            const byYear = rules.mandatory_year_groups.includes(Number(s.year_group));
            const included = rules.included_student_ids.includes(id), excluded = rules.excluded_student_ids.includes(id);
            return [{...s, mandatory: (byYear || included) && !excluded}];
        });
    }
    function mount(container) {
        let students = [], rules = {}, event = null, today = '';
        const element = (tag, text, className) => { const el=document.createElement(tag); if(text) el.textContent=text; if(className) el.className=className; return el; };
        const dateGroup=element('div',null,'form-group');
        const label=element('label','Date'); label.htmlFor='eventDate';
        const date=element('input'); date.type='text'; date.id='eventDate'; date.placeholder='Select date'; dateGroup.append(label,date);
        const calendar = root.flatpickr ? root.flatpickr(date, {dateFormat:'Y-m-d', altInput:true, altFormat:'F j, Y', disableMobile:true, locale:{firstDayOfWeek:1}, onChange:render}) : null;
        if (!calendar) date.type='date';
        else { calendar.altInput.id='eventDateDisplay'; label.htmlFor='eventDateDisplay'; }
        const notice=element('p',null,'form-help'); notice.setAttribute('role','status');
        const eligibleGroup=element('fieldset',null,'year-options form-group'); eligibleGroup.append(element('legend','Eligible year groups'));
        const eligibleOptions=element('div',null,'year-checkboxes'); eligibleGroup.append(eligibleOptions);
        const mandatoryGroup=element('fieldset',null,'year-options form-group'); mandatoryGroup.append(element('legend','Mandatory year groups'));
        const mandatoryOptions=element('div',null,'year-checkboxes'); mandatoryGroup.append(mandatoryOptions);
        container.append(dateGroup,eligibleGroup,mandatoryGroup);
        const sections={};
        for(const [field,title] of [['manual_student_ids','Assigned Students'],['excluded_student_ids','Excluded from mandatory attendance'],['included_student_ids','Included in mandatory attendance']]) {
            const section=element('div',null,'form-group');
            const heading=element('label',title); heading.htmlFor=`event_${field}_search`;
            const tags=element('div',null,'tags-input-container'); tags.id=`event_${field}_tags`;
            const add=element('button',null,'btn-tag-add');add.innerHTML=document.querySelector('#addStudentTagBtn').innerHTML;add.type='button';add.id=`event_${field}_add`;add.setAttribute('aria-expanded','false');
            const dropdown=element('div',null,'student-picker-dropdown');dropdown.hidden=true;dropdown.id=`event_${field}_picker`;add.setAttribute('aria-controls',dropdown.id);
            const search=element('input');search.type='text';search.id=heading.htmlFor;search.placeholder='Search students...';search.autocomplete='off';
            const results=element('div',null,'student-picker-list');
            dropdown.append(search,results);section.append(heading,tags,dropdown);container.append(section);
            sections[field]={tags,search,results,add,dropdown};
            sections[field].popover=root.StudentPicker.attach(dropdown,add,()=>renderPicker(field));
            if(field==='manual_student_ids')section.append(element('p','Students in the selected year groups are added automatically.','form-help'));
            search.addEventListener('input',()=>renderPicker(field));
            search.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closePickers();add.focus();}});
        }
        container.append(notice);
        function closePickers(){Object.values(sections).forEach(s=>s.popover.close());}
        function yearCheckbox(year,checked,change) {
            const label=element('label');const checkbox=element('input');checkbox.type='checkbox';checkbox.value=year;checkbox.checked=checked;
            checkbox.addEventListener('change',()=>change(checkbox.checked));label.append(checkbox,document.createTextNode(`Year ${year}`));return label;
        }
        function eligibleStudents() {return students.filter(s=>rules.year_groups.includes(Number(s.year_group)));}
        function prune() {
            let removed=0;
            const years=rules.mandatory_year_groups.filter(y=>rules.year_groups.includes(y));removed+=rules.mandatory_year_groups.length-years.length;rules.mandatory_year_groups=years;
            const ids=new Set(eligibleStudents().map(s=>Number(s.id)));
            for(const field of arrays.slice(2)){const kept=rules[field].filter(id=>ids.has(id));removed+=rules[field].length-kept.length;rules[field]=kept;}
            notice.textContent=removed ? `${removed} incompatible selection${removed===1?' was':'s were'} removed because the eligible years changed.` : '';
        }
        function renderPicker(field) {
            const {search,results}=sections[field];results.replaceChildren();
            const mandatory=new Set(calculate(students,rules).filter(s=>s.mandatory).map(s=>Number(s.id)));
            const enrolled=new Set(calculate(students,rules).map(s=>Number(s.id)));
            const candidates=eligibleStudents().filter(s=>!rules[field].includes(Number(s.id)) && s.name.toLowerCase().includes(search.value.toLowerCase()) &&
                (field==='excluded_student_ids' ? mandatory.has(Number(s.id)) : field==='included_student_ids' ? !mandatory.has(Number(s.id)) : true));
            candidates.forEach(s=>{
                const button=element('button',s.name,'picker-item');button.type='button';
                button.addEventListener('click',()=>{
                    const id=Number(s.id);rules[field].push(id);
                    if(field==='included_student_ids')rules.excluded_student_ids=rules.excluded_student_ids.filter(x=>x!==id);
                    if(field==='excluded_student_ids')rules.included_student_ids=rules.included_student_ids.filter(x=>x!==id);
                    search.value='';render();
                });results.append(button);
            });
            if(!candidates.length)results.append(element('div','No students found','picker-empty'));
        }
        function render() {
            eligibleOptions.replaceChildren(); mandatoryOptions.replaceChildren();
            [9,10,11,12,13].forEach(year=>eligibleOptions.append(yearCheckbox(year,rules.year_groups.includes(year),checked=>{
                rules.year_groups=checked?[...rules.year_groups,year]:rules.year_groups.filter(y=>y!==year);prune();render();
            })));
            [...rules.year_groups].sort((a,b)=>a-b).forEach(year=>mandatoryOptions.append(yearCheckbox(year,rules.mandatory_year_groups.includes(year),checked=>{
                rules.mandatory_year_groups=checked?[...rules.mandatory_year_groups,year]:rules.mandatory_year_groups.filter(y=>y!==year);render();
            })));
            if(!rules.year_groups.length)mandatoryOptions.append(element('span','Select eligible years first','form-help'));
            closePickers();
            for(const field of arrays.slice(2)) {
                const {tags,add}=sections[field];tags.replaceChildren();
                const saved = event?.frozen && unchanged() && date.value < today;
                const assigned = saved ? event.participants.filter(p=>Number(p.active)) : calculate(students,rules);
                const ids = field==='manual_student_ids' ? assigned.map(s=>Number(s.id)) : rules[field];
                ids.forEach(id=>{
                    const student=(saved ? event.participants : students).find(s=>Number(s.id)===id) || event?.participants?.find(s=>Number(s.id)===id);
                    const chip=element('div',null,'tag-chip');chip.append(element('span',student?.name || `Student #${id}`));
                    if(field!=='manual_student_ids' || rules.manual_student_ids.includes(id)) {
                        const remove=element('button','×','tag-remove');remove.type='button';remove.setAttribute('aria-label',`Remove ${student?.name || id}`);
                        remove.addEventListener('click',()=>{rules[field]=rules[field].filter(x=>x!==id);render();});chip.append(remove);
                    } else chip.title='Assigned by year group';
                    tags.append(chip);
                });
                tags.append(add);
            }
        }

        function unchanged(){return event && arrays.every(field=>JSON.stringify([...rules[field]].sort((a,b)=>a-b))===JSON.stringify([...(event[field]||[])].sort((a,b)=>a-b)));}
        return {
            set(activity,directory,currentDate){event=activity;students=directory;today=currentDate;rules=Object.fromEntries(arrays.map(field=>[field,[...(activity?.[field]||[])].map(Number)]));date.value=activity?.event_date||'';if(calendar)calendar.setDate(date.value,false);notice.textContent='';Object.values(sections).forEach(s=>s.search.value='');render();},
            get(){return {event_date:date.value,...Object.fromEntries(arrays.map(field=>[field,rules[field].join(',')]))};},
            setRequired(required){date.required=required;if(calendar?.altInput)calendar.altInput.required=required;}
        };
    }
    if(typeof module!=='undefined')module.exports={calculate};else root.EventForm={mount,calculate};
})(typeof window!=='undefined'?window:globalThis);
