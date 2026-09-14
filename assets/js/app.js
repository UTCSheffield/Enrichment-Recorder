(() => {
    const q = sel => document.querySelector(sel); // Shorted code since it's used a million times
    const role = (window.__ER_ROLE__ || 'teacher');
    const can = {
        admin: role === 'super_admin' || role === 'admin',
        head: role === 'super_admin' || role === 'admin' || role === 'head',
        teacher: role === 'super_admin' || role === 'admin' || role === 'head' || role === 'teacher',
    };

    let activityScope = 'normal';
    let viewGeneration = 0;
    const scopeLabel = () => activityScope === 'event' ? 'Events' : activityScope === 'whole_school' ? 'Archived whole-school activities' : 'Activities';
    let archiveWeek = '';
    let showEventHistory = false;
    const reportStudents = () => activityScope === 'event' ? (state.reportStudents || state.students) : state.students;

    const api = async (action, method = 'GET', body = null) => {
        const requestGeneration = viewGeneration;
        body = { ...(body || {}), scope: activityScope };
        const opts = { method, headers: {} };
        let url = `/?action=${encodeURIComponent(action)}`;
        if (method === 'GET') {
            if (body && typeof body === 'object') {
                url += '&' + new URLSearchParams(body).toString();
            }
        } else {
            opts.body = new URLSearchParams(body || {});
        }
        const res = await fetch(url, opts);
        if (res.status === 401) {
            // Cookie expired/cleared
            window.location.href = '/';
            return { error: 'Unauthorized' };
        }
        const data = await res.json();
        if (requestGeneration !== viewGeneration) return { stale: true };
        if (res.status === 403 && !data?.error) {
            data.error = 'Not allowed';
        }
        return data;
    };

    // state
    let state = { students: [], activities: [], attendance: {} };
    let selectedActivity = null;
    let selectedWeekStart = null;
    let focusedRow = 0;
    let selectedStudentIds = new Set();
    let currentRegisterStudents = [];
    let currentRegisterHasMandatory = true;

    // UI elements
    const activitiesList = q('#activitiesList');
    const addActivityBtn = q('#addActivityBtn');
    const weekStartInput = q('#weekStart');
    const registerArea = q('#registerArea');
    const statsArea = q('#statsArea');
    const settingsArea = q('#settingsArea');
    const navStats = q('#navStats');
    const navSettings = q('#navSettings');
    const activityTitle = q('#activityTitle');
    const activityDescription = q('#activityDescription');
    const editActivityBtn = q('#editActivityBtn');
    const toggleThemeBtn = q('#toggleTheme');

    function applyRoleGating() {
        // Admin-only sections
        if (!can.admin) {
            if (navStats) navStats.style.display = 'none';
            if (navSettings) navSettings.style.display = 'none';
        }

        // Head/Admin: can create/edit activities. Teachers cannot.
        if (!can.head) {
            if (addActivityBtn) addActivityBtn.style.display = 'none';
            if (editActivityBtn) editActivityBtn.style.display = 'none';
        }

        // Admin: student CRUD in settings
        if (!can.admin) {
            if (createStudentBtn) createStudentBtn.style.display = 'none';
        }
    }

    // Stats Elements
    const statTotalStudents = q('#statTotalStudents');
    const statTotalActivities = q('#statTotalActivities');
    const statTotalAttendance = q('#statTotalAttendance');
    const statsTable = q('#statsTable tbody');
    const statsActivitiesTable = q('#statsActivitiesTable tbody');
    const statsYearGroupsTable = q('#statsYearGroupsTable tbody');
    const statsDepartmentsTable = q('#statsDepartmentsTable tbody');
    const statsSearch = q('#statsSearch');
    const downloadCsvBtn = q('#downloadCsvBtn');
    let chartWeekly = null;
    let chartActivities = null;
    let statsData = null;

    // Settings Elements
    const settingsStudentsTable = q('#settingsStudentsTable tbody');
    const selectAllStudents = q('#selectAllStudents');
    const massDeleteBtn = q('#massDeleteBtn');
    const massAddToActivityBtn = q('#massAddToActivityBtn');
    const addToActivityModal = q('#addToActivityModal');
    const addToActivityForm = q('#addToActivityForm');
    const targetActivitySelect = q('#targetActivitySelect');
    const selectedCountText = q('#selectedCountText');

    // Modal elements
    const createStudentBtn = q('#createStudentBtn');
    const assignStudentBtn = q('#assignStudentBtn');
    const assignStudentModal = q('#assignStudentModal');
    const assignStudentForm = q('#assignStudentForm');
    const assignStudentTags = q('#assignStudentTags');
    const assignStudentAddBtn = q('#assignStudentAddBtn');
    const assignStudentDropdown = q('#assignStudentDropdown');
    const assignStudentSearch = q('#assignStudentSearch');
    const assignStudentList = q('#assignStudentList');

    const studentModal = q('#studentModal');
    const studentForm = q('#studentForm');
    const studentIdInput = q('#studentIdInput');
    const studentActivityIdInput = q('#studentActivityIdInput');
    const studentEditContextInput = q('#studentEditContextInput');
    const firstNameInput = q('#firstName');
    const lastNameInput = q('#lastName');
    const studentYearGroup = q('#studentYearGroup');
    const studentMandatoryInput = q('#studentMandatory');
    const studentNoteInput = q('#studentNote');
    const studentModalTitle = q('#studentModalTitle');
    const saveStudentBtn = q('#saveStudentBtn');
    const deleteStudentBtn = q('#deleteStudentBtn');

    const activityModal = q('#activityModal');
    const activityForm = q('#activityForm');
    const activityIdInput = q('#activityIdInput');
    const activityNameInput = q('#activityNameInput');
    const activityDescriptionInput = q('#activityDescriptionInput');
    const activityDepartmentInput = q('#activityDepartmentInput');
    const departmentSelector = q('#departmentSelector');
    const activitySessionsInput = q('#activitySessions');
    const activityHasMandatoryInput = q('#activityHasMandatory');
    const activityModalTitle = q('#activityModalTitle');
    const saveActivityBtn = q('#saveActivityBtn');
    const deleteActivityBtn = q('#deleteActivityBtn');

    const closeModalBtns = document.querySelectorAll('.close-modal');

    function isoMonday(d = new Date()) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        date.setDate(date.getDate() + diff);
        date.setHours(0, 0, 0, 0);
        return date.toISOString().slice(0, 10);
    }

    async function loadState() {
        const res = await api('get_state');
        if (res.stale) return;
        if (res.error) return alert(res.error);
        state.students = res.students;
        state.reportStudents = res.report_students;
        state.schoolStudentCount = res.school_student_count;
        state.today = res.today;
        state.activities = res.activities;
        renderActivities();
        if (!state.activities.length && registerArea.style.display !== 'none') {
            selectedActivity = null;
            activityTitle.textContent = `${scopeLabel()}`;
            activityDescription.textContent = '';
            editActivityBtn.style.display = 'none';
            assignStudentBtn.style.display = 'none';
            registerArea.innerHTML = `<div class="empty-state">${activityScope === 'event' ? 'Select an event from the sidebar, or use New Event to create one.' : activityScope === 'normal' ? 'Select an activity from the sidebar, or use New Activity to create one.' : 'No archived activities.'}</div>`;
        }
        if (!selectedWeekStart) selectedWeekStart = isoMonday();
        weekStartInput.value = selectedWeekStart;

        // If settings is active, re-render settings
        if (settingsArea.style.display !== 'none') {
            renderSettings();
        }

        // If we are in stats mode, don't auto-select activity
        if (registerArea.style.display !== 'none' && state.activities.length && !selectedActivity) {
            selectActivity(state.activities[0].id);
        }
    }

    function renderActivities() {
        activitiesList.innerHTML = '';
        state.activities.sort((a,b) => {
            if (activityScope !== 'event') return 0;
            const ap = a.event_date < state.today, bp = b.event_date < state.today;
            return ap !== bp ? (ap ? 1 : -1) : (ap ? b.event_date.localeCompare(a.event_date) : a.event_date.localeCompare(b.event_date));
        }).forEach(a => {
            const el = document.createElement('div');
            el.tabIndex = 0;
            el.className = 'nav-item' + (selectedActivity === a.id ? ' active' : '');
            el.innerHTML = `<span></span><span class="meta"></span>`;
            el.firstElementChild.textContent = a.name;
            el.lastElementChild.textContent = activityScope === 'event' ? a.event_date : `${a.sessions_per_week}/wk`;
            el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectActivity(a.id); } };
            el.onclick = () => selectActivity(a.id);
            activitiesList.appendChild(el);
        });
    }

    function closeMobileNavigation() {
        q('.sidebar').classList.remove('navigation-open');
        q('#mobileNavToggle').setAttribute('aria-expanded', 'false');
    }
    q('#mobileNavToggle').addEventListener('click', () => {
        const open = q('.sidebar').classList.toggle('navigation-open');
        q('#mobileNavToggle').setAttribute('aria-expanded', String(open));
    });

    async function selectActivity(id) {
        if (!state.activities.some(activity => activity.id == id)) return;
        closeMobileNavigation();
        selectedActivity = id;
        showEventHistory = false;
        state.attendance = {};
        currentRegisterStudents = [];
        registerArea.textContent = 'Loading register…';
        registerArea.style.display = 'block';
        statsArea.style.display = 'none';
        settingsArea.style.display = 'none';
        navStats.classList.remove('active');
        navSettings.classList.remove('active');
        
        createStudentBtn.style.display = 'none';
        assignStudentBtn.style.display = 'none';

        renderActivities();
        const act = state.activities.find(x => x.id == id);
        assignStudentBtn.style.display = act && activityScope === 'normal' ? 'flex' : 'none';
        if (activityScope === 'whole_school') {
            const weeks = act.recorded_weeks || [];
            if (!weeks.includes(archiveWeek)) archiveWeek = weeks[0] || '';
            q('#archiveWeek').replaceChildren(...weeks.map(week => new Option(week, week)));
            q('#archiveWeek').value = archiveWeek;
        }
        activityTitle.textContent = act ? act.name : 'Register';
        activityDescription.textContent = act ? [activityScope === 'event' ? act.event_date : '', act.description || ''].filter(Boolean).join(' · ') : '';
        editActivityBtn.style.display = (act && can.head && activityScope !== 'whole_school') ? 'flex' : 'none';
        await loadAttendance();
    }

    async function loadStats() {
        closeMobileNavigation();
        selectedActivity = null;
        renderActivities(); // Clear active state
        navStats.classList.add('active');
        navSettings.classList.remove('active');
        registerArea.style.display = 'none';
        statsArea.style.display = 'block';
        settingsArea.style.display = 'none';
        activityTitle.textContent = `${scopeLabel()} statistics`;
        activityDescription.textContent = '';
        editActivityBtn.style.display = 'none';
        createStudentBtn.style.display = 'none';
        assignStudentBtn.style.display = 'none';

        const res = await api('get_stats');
        if (res.stale) return;
        if (res.error) return alert(res.error);
        statsData = res.stats;

        renderStatsDashboard();
    }

    function renderStatsDashboard() {
        if (!statsData) return;

        // KPI Cards
        statTotalStudents.textContent = state.schoolStudentCount ?? state.students.length;
        statTotalActivities.textContent = state.activities.length;

        // Calculate total attendance
        const totalAtt = Object.values(statsData.students).reduce((a, b) => a + parseInt(b), 0);
        statTotalAttendance.textContent = totalAtt;

        // Charts
        renderCharts();

        // Table
        renderStatsTable();
        renderStatsActivitiesTable();
        renderStatsYearGroupsTable();
        renderStatsDepartmentsTable();
    }

    function renderCharts() {
        const ctxWeekly = q('#chartWeekly').getContext('2d');
        const ctxActivities = q('#chartActivities').getContext('2d');

        // Destroy existing
        if (chartWeekly) chartWeekly.destroy();
        if (chartActivities) chartActivities.destroy();

        // Weekly Data
        const weeks = statsData.weekly.map(x => x.week_start);
        const weekCounts = statsData.weekly.map(x => x.count);

        chartWeekly = new Chart(ctxWeekly, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Attendance',
                    data: weekCounts,
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });

        // Activity Data
        const actLabels = [];
        const actCounts = [];
        state.activities.forEach(a => {
            actLabels.push(a.name);
            actCounts.push(statsData.activities[a.id] || 0);
        });

        chartActivities = new Chart(ctxActivities, {
            type: 'bar',
            data: {
                labels: actLabels,
                datasets: [{
                    label: activityScope === 'event' ? 'Events' : 'Sessions',
                    data: actCounts,
                    backgroundColor: [
                        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#af52de'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });
    }

    function renderStatsTable(filter = '') {
        statsTable.innerHTML = '';
        const term = filter.trim().toLowerCase();
        // sam was here

        if (!term) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="3" style="text-align:center; padding: 20px; color: var(--text-secondary);">${reportStudents().length} students. Type to search.</td>`;
            statsTable.appendChild(tr);
            return;
        }

        reportStudents().forEach(s => {
            if (!s.name.toLowerCase().includes(term)) return;

            const attended = statsData.students[s.id] || 0;

            // Find which activities they are in
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join(', ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
            <td>${s.name}</td>
            <td>${attended}</td>
            <td>${actNames || '<span style="color:var(--text-secondary)">None</span>'}</td>
          `;
            statsTable.appendChild(tr);
        });
    }

    function renderStatsActivitiesTable() {
        statsActivitiesTable.innerHTML = '';
        
        state.activities.forEach(a => {
            const totalAttendance = statsData.activities[a.id] || 0;
            const numWeeks = statsData.weekly.length || 1;
            const avgPerWeek = (totalAttendance / numWeeks).toFixed(1);

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.innerHTML = `
                <td>${a.name}</td>
                <td>${activityScope === 'event' ? a.event_date : avgPerWeek}</td>
                <td>${totalAttendance}</td>
            `;
            tr.onclick = () => openActivityStats(a.id);
            statsActivitiesTable.appendChild(tr);
        });
    }

    function renderStatsYearGroupsTable() {
        statsYearGroupsTable.innerHTML = '';
        const groups = statsData.year_groups || {};
        
        // Sort keys (9, 10, 11...)
        Object.keys(groups).sort((a,b) => parseInt(a)-parseInt(b)).forEach(yg => {
            const count = groups[yg];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>Year ${yg}</td>
                <td>${count}</td>
                <td><button class="btn-sm download-yg-btn" data-yg="${yg}">Download CSV</button></td>
            `;
            
            tr.querySelector('.download-yg-btn').onclick = async (e) => {
                e.stopPropagation();
                await downloadYearGroupCsv(yg);
            };
            
            statsYearGroupsTable.appendChild(tr);
        });
    }

    function renderStatsDepartmentsTable() {
        statsDepartmentsTable.innerHTML = '';
        const depts = statsData.departments || {};
        
        Object.keys(depts).sort().forEach(dept => {
            const count = depts[dept];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dept}</td>
                <td>${count}</td>
                <td><button class="btn-sm download-dept-btn" data-dept="${dept}">Download CSV</button></td>
            `;
            
            tr.querySelector('.download-dept-btn').onclick = async (e) => {
                e.stopPropagation();
                await downloadDepartmentCsv(dept);
            };
            
            statsDepartmentsTable.appendChild(tr);
        });
    }

    downloadCsvBtn?.addEventListener('click', async () => {
        const res = await api('get_export_stats');
        if (res.stale) return;
        if (res.error) return alert(res.error);
        processAndDownloadCsv(res.data.map(row => ({...row, count: row.attended})), 'Attendance_Report.csv');
    });

    async function downloadYearGroupCsv(yearGroup) {
        const res = await api('get_year_group_export', 'GET', { year_group: yearGroup });
        if (res.stale) return;
        if (res.error) return alert(res.error);
        processAndDownloadCsv(res.data, `Year_${yearGroup}_Report.csv`);
    }

    async function downloadDepartmentCsv(department) {
        const res = await api('get_department_export', 'GET', { department: department });
        if (res.stale) return;
        if (res.error) return alert(res.error);
        processAndDownloadCsv(res.data, `${department}_Report.csv`);
    }

    function processAndDownloadCsv(rawData, filename) {
        // 1. Get all unique weeks and sort them
        const weeksSet = new Set();
        rawData.forEach(r => weeksSet.add(r.week_start));
        const weeks = Array.from(weeksSet).sort();
        
        // 2. Map attendance data
        const attendanceMap = {};
        rawData.forEach(r => {
            if (!attendanceMap[r.student_id ?? r.student_name]) {
                attendanceMap[r.student_id ?? r.student_name] = {
                    name: r.student_name,
                    weeks: {},
                    total: 0
                };
            }
            const count = parseInt(r.count);
            attendanceMap[r.student_id ?? r.student_name].weeks[r.week_start] = (attendanceMap[r.student_id ?? r.student_name].weeks[r.week_start] || 0) + count;
            attendanceMap[r.student_id ?? r.student_name].total += count;
        });

        // 3. Build CSV
        let csv = 'Student Name,' + weeks.map(w => `${activityScope === "event" ? "" : "W/C "}${formatCsvDate(w)}`).join(',') + `,Total ${activityScope === 'event' ? 'Events' : 'Sessions'} Attended\n`;
        
        // Sort students by name
        const studentNames = Object.keys(attendanceMap).sort((a,b) => attendanceMap[a].name.localeCompare(attendanceMap[b].name));
        
        studentNames.forEach(name => {
            const data = attendanceMap[name];
            const weekCols = weeks.map(w => data.weeks[w] || 0).join(',');
            csv += `"${data.name.replaceAll('"', '""')}",${weekCols},${data.total}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activityScope === 'whole_school' ? 'archived_whole_school' : activityScope}_${filename}`;
        a.click();
    }

    function loadSettings() {
        selectedActivity = null;
        renderActivities();
        navStats.classList.remove('active');
        navSettings.classList.add('active');
        registerArea.style.display = 'none';
        statsArea.style.display = 'none';
        settingsArea.style.display = 'block';
        activityTitle.textContent = 'Settings';
        activityDescription.textContent = '';
        editActivityBtn.style.display = 'none';
        createStudentBtn.style.display = 'flex';
        assignStudentBtn.style.display = 'none';
        
        selectedStudentIds.clear();
        renderSettings();
    }

    function renderSettings() {
        settingsStudentsTable.innerHTML = '';
        const allSelected = state.students.length > 0 && selectedStudentIds.size === state.students.length;
        selectAllStudents.checked = allSelected;
        selectAllStudents.indeterminate = selectedStudentIds.size > 0 && !allSelected;

        state.students.forEach((s, index) => {
            const tr = document.createElement('tr');
            const isSelected = selectedStudentIds.has(s.id);
            tr.innerHTML = `
                <td><input type="checkbox" class="student-checkbox" data-id="${s.id}" data-index="${index}" ${isSelected ? 'checked' : ''}></td>
                <td>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${s.name}</span>
                        <button class="icon-btn edit-student-btn" data-id="${s.id}" style="opacity:0.5; padding:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                </td>
                <td style="color:var(--text-secondary); font-family:monospace;">${s.id}</td>
            `;
            
            // Add hover effect for edit button
            const btn = tr.querySelector('.edit-student-btn');
            btn.onmouseover = () => btn.style.opacity = '1';
            btn.onmouseout = () => btn.style.opacity = '0.5';
            btn.onclick = (e) => {
                e.stopPropagation(); // Prevent row click if we add one later
                openEditStudentModal(s);
            };

            settingsStudentsTable.appendChild(tr);
        });

        updateSettingsButtons();
    }

    function updateSettingsButtons() {
        const count = selectedStudentIds.size;
        massDeleteBtn.disabled = count === 0;
        massAddToActivityBtn.disabled = count === 0;
        massAddToActivityBtn.hidden = activityScope !== 'normal';
        selectedCountText.textContent = `${count} student${count !== 1 ? 's' : ''} selected`;
    }

    if (can.admin) navSettings.addEventListener('click', loadSettings);

    selectAllStudents.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.students.forEach(s => selectedStudentIds.add(s.id));
        } else {
            selectedStudentIds.clear();
        }
        renderSettings();
    });

    let lastCheckedIndex = -1;

    settingsStudentsTable.addEventListener('change', (e) => {
        if (e.target.classList.contains('student-checkbox')) {
            const id = parseInt(e.target.dataset.id);
            const index = parseInt(e.target.dataset.index);
            const checked = e.target.checked;

            if (e.shiftKey && lastCheckedIndex !== -1) {
                const start = Math.min(lastCheckedIndex, index);
                const end = Math.max(lastCheckedIndex, index);
                
                for (let i = start; i <= end; i++) {
                    const s = state.students[i];
                    if (checked) {
                        selectedStudentIds.add(s.id);
                    } else {
                        selectedStudentIds.delete(s.id);
                    }
                }
            } else {
                if (checked) {
                    selectedStudentIds.add(id);
                } else {
                    selectedStudentIds.delete(id);
                }
            }
            
            lastCheckedIndex = index;
            renderSettings(); // Re-render to update header checkbox state and all checkboxes
        }
    });

    massDeleteBtn.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to delete ${selectedStudentIds.size} students? This cannot be undone.`)) return;
        
        const ids = Array.from(selectedStudentIds);
        const res = await api('delete_students', 'POST', { ids: ids.join(',') });
        if (res.stale) return;
        if (res.error) return alert(res.error);
        
        await loadState();
        loadSettings();
    });

    massAddToActivityBtn.addEventListener('click', () => {
        addToActivityModal.classList.add('active');
        targetActivitySelect.innerHTML = '<option value="">-- Select Activity --</option>';
        state.activities.filter(a => !Number(a.all_students_mandatory)).forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name;
            targetActivitySelect.appendChild(opt);
        });
        updateSettingsButtons(); // Update count text
    });

    addToActivityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const activityId = parseInt(targetActivitySelect.value);
        if (!activityId) return;

        const activity = state.activities.find(a => a.id === activityId);
        if (!activity) return;

        // Merge students
        const currentIds = new Set(activity.student_ids || []);
        selectedStudentIds.forEach(id => currentIds.add(id));
        
        const newIds = Array.from(currentIds);
        if (activity.scope === 'whole_school' && newIds.some(id => !state.students.some(student => student.id == id && activity.year_groups.includes(Number(student.year_group))))) return alert('Only students in the activity’s eligible years can be assigned.');
        
        const res = await api('update_activity', 'POST', {
            id: activity.id,
            name: activity.name,
            description: activity.description || '',
            sessions_per_week: activity.sessions_per_week,
            student_ids: newIds.join(',')
        });
        if (res.stale) return;

        if (res.error) return alert(res.error);

        addToActivityModal.classList.remove('active');
        await loadState();
        alert(`Added students to ${activity.name}`);
    });

    if (can.admin) navStats.addEventListener('click', loadStats);
    statsSearch.addEventListener('input', (e) => renderStatsTable(e.target.value));

    // Helper for CSV dates (YYYY-MM-DD -> DD-MM-YY)
    function formatCsvDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}-${m}-${y.slice(2)}`;
    }

    async function loadAttendance() {
        if (!selectedActivity) return;
        const requestedActivity = selectedActivity;
        const requestedWeek = activityScope === 'whole_school' ? archiveWeek : selectedWeekStart;
        const res = await api('get_attendance', 'GET', { activity_id: selectedActivity, week_start: activityScope === 'whole_school' ? archiveWeek : selectedWeekStart });
        if (res.stale) return;
        if (requestedActivity !== selectedActivity || requestedWeek !== (activityScope === 'whole_school' ? archiveWeek : selectedWeekStart)) return;
        if (res.error) return alert(res.error);
        state.attendance = res.attendance || {};
        renderRegister();
    }

    const allStudentsMandatory = q('#allStudentsMandatory');
    const formYears = () => [...document.querySelectorAll('[name="eligible_year"]:checked')].map(el => Number(el.value));
    const eligibleForForm = student => activityScope !== 'whole_school' || formYears().includes(Number(student.year_group));
    const eligibleForActivity = student => {
        const activity = state.activities.find(a => a.id == selectedActivity);
        return activity?.scope !== 'whole_school' || activity.year_groups.includes(Number(student.year_group));
    };
    function refreshSchoolForm() {
        const automatic = activityScope === 'whole_school' && allStudentsMandatory.checked;
        q('#automaticRosterHelp').hidden = !automatic;
        activityHasMandatoryInput.disabled = automatic;
        q('#activityStudentTags').parentElement.hidden = automatic;
        currentActivityStudentIds = currentActivityStudentIds.filter(id => state.students.some(student => student.id == id && eligibleForForm(student)));
        renderStudentTags();
        renderStudentPicker();
    }
    const eventForm = window.EventForm.mount(q('#eventFields'));
    function configureSchoolForm(activity = null) {
        const event = activityScope === 'event';
        q('label[for=activityNameInput]').textContent = event ? 'Name' : 'Activity Name';
        q('#wholeSchoolOptions').hidden = true;
        q('#eventFields').hidden = !event;
        q('#recurringSessionField').hidden = event;
        activityHasMandatoryInput.closest('.form-group').hidden = event;
        activityHasMandatoryInput.disabled = false;
        q('#activityStudentTags').parentElement.hidden = event;
        eventForm.setRequired(event);
        if (event) eventForm.set(activity, state.students, state.today);
    }
    async function switchScope(scope) {
        if (csvBusy) return;
        viewGeneration++;
        activityScope = scope;
        const event = scope !== 'normal';
        q('#activityScopeSwitch').dataset.events = String(event);
        q('#activityScopeSwitch').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === (event ? 'event' : 'normal'))));
        q('#activityWeekSection').hidden = event;
        q('#archiveControls').hidden = scope !== 'whole_school';
        q('#registerKeyboardHints').hidden = scope === 'whole_school';
        q('#recurringSessionHint').hidden = event;
        addActivityBtn.style.display = scope === 'whole_school' ? 'none' : '';
        addActivityBtn.textContent = scope === 'event' ? '+ New Event' : '+ New Activity';
        navSettings.style.display = scope === 'whole_school' ? 'none' : '';
        document.querySelectorAll('[data-activity-label]').forEach(el => {
            el.textContent = scope === 'event' ? el.dataset.eventLabel : el.dataset.activityLabel;
        });
        q('#activityScopeLabel').textContent = scopeLabel();
        q('#mobileNavToggle').textContent = `${scopeLabel()} · Menu`;
        closeModal();
        selectedActivity = null;
        state.activities = [];
        state.attendance = {};
        statsData = null;
        currentRegisterStudents = [];
        currentStatsStudent = null;
        currentStatsActivity = null;
        selectedStudentIds.clear();
        registerArea.style.display = 'block';
        statsArea.style.display = 'none';
        settingsArea.style.display = 'none';
        navStats.classList.remove('active');
        navSettings.classList.remove('active');
        editActivityBtn.style.display = 'none';
        assignStudentBtn.style.display = 'none';
        createStudentBtn.style.display = 'none';
        editActivityBtn.title = scope === 'event' ? 'Edit Event' : 'Edit Activity';
        activityTitle.textContent = scopeLabel();
        activityDescription.textContent = '';
        registerArea.textContent = 'Loading…';
        renderActivities();
        await loadState();
    }
    q('#activityScopeSwitch')?.addEventListener('click', e => {
        const button = e.target.closest('button[data-scope]');
        if (button) switchScope(button.dataset.scope);
    });
    q('#activityScopeSwitch')?.addEventListener('keydown', e => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
        e.preventDefault();
        const scope = ['ArrowLeft','Home'].includes(e.key) ? 'normal' : 'event';
        q(`#activityScopeSwitch [data-scope="${scope}"]`).focus();
        switchScope(scope);
    });
    q('#archiveWeek').addEventListener('change', e => { archiveWeek = e.target.value; loadAttendance(); });

    // Tag Management Logic
    let currentActivityStudentIds = [];
    const activityStudentTags = q('#activityStudentTags');
    const addStudentTagBtn = q('#addStudentTagBtn');
    const studentPickerDropdown = q('#studentPickerDropdown');
    const studentPickerSearch = q('#studentPickerSearch');
    const studentPickerList = q('#studentPickerList');

    function renderStudentTags() {
        // Clear existing tags but keep the add button
        const tags = activityStudentTags.querySelectorAll('.tag-chip');
        tags.forEach(t => t.remove());

        currentActivityStudentIds.forEach(sid => {
            const s = state.students.find(x => x.id == sid);
            if (!s) return;

            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.innerHTML = `
            <span>${s.name}</span>
            <span class="tag-remove" data-id="${sid}">&times;</span>
          `;
            chip.querySelector('.tag-remove').onclick = () => {
                currentActivityStudentIds = currentActivityStudentIds.filter(id => id !== sid);
                renderStudentTags();
            };
            activityStudentTags.insertBefore(chip, addStudentTagBtn);
        });
    }

    function renderStudentPicker(filter = '') {
        studentPickerList.innerHTML = '';
        const available = state.students.filter(s => !currentActivityStudentIds.includes(s.id) && eligibleForForm(s));
        const filtered = available.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            studentPickerList.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:12px;">No students found</div>';
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = s.name;
            item.onclick = () => {
                currentActivityStudentIds.push(s.id);
                renderStudentTags();
                activityPicker.close();
                studentPickerSearch.value = '';
            };
            studentPickerList.appendChild(item);
        });
    }

    const activityPicker = window.StudentPicker.attach(studentPickerDropdown, addStudentTagBtn, () => renderStudentPicker(studentPickerSearch.value));
    studentPickerSearch.addEventListener('input', e => renderStudentPicker(e.target.value));

    // --- Assign Student Modal Logic ---
    let assignStudentIds = [];

    function positionAssignDropdown(dropdown, trigger, width) {
        dropdown.style.width = `${width}px`;
        const rect = trigger.getBoundingClientRect();
        const margin = 8;
        const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
        let top = rect.bottom + 4;
        const height = dropdown.offsetHeight || 200;

        if (top + height > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - height - 4);
        }

        dropdown.style.left = `${left}px`;
        dropdown.style.top = `${top}px`;
    }

    function renderAssignTags() {
        // Clear existing tags but keep the add button
        const tags = assignStudentTags.querySelectorAll('.tag-chip');
        tags.forEach(t => t.remove());

        assignStudentIds.forEach(sid => {
            const s = state.students.find(x => x.id == sid);
            if (!s) return;

            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.innerHTML = `
            <span>${s.name}</span>
            <span class="tag-remove" data-id="${sid}">&times;</span>
          `;
            chip.querySelector('.tag-remove').onclick = () => {
                assignStudentIds = assignStudentIds.filter(id => id !== sid);
                renderAssignTags();
            };
            assignStudentTags.insertBefore(chip, assignStudentAddBtn);
        });

        if (assignStudentDropdown.style.display === 'flex') {
            positionAssignDropdown(assignStudentDropdown, assignStudentAddBtn, 250);
        }

        const assignYearGroupDropdown = document.getElementById('assignYearGroupDropdown');
        const assignYearGroupBtn = document.getElementById('assignYearGroupBtn');
        if (assignYearGroupDropdown && assignYearGroupBtn && assignYearGroupDropdown.style.display === 'flex') {
            positionAssignDropdown(assignYearGroupDropdown, assignYearGroupBtn, 140);
        }
    }

    function renderAssignPicker(filter = '') {
        assignStudentList.innerHTML = '';
        const available = state.students.filter(s => !assignStudentIds.includes(s.id) && eligibleForActivity(s));
        const filtered = available.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            assignStudentList.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:12px;">No students found</div>';
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = s.name;
            item.onclick = () => {
                assignStudentIds.push(s.id);
                renderAssignTags();
                assignStudentDropdown.style.display = 'none';
                assignStudentSearch.value = '';
            };
            assignStudentList.appendChild(item);
        });
    }

    assignStudentAddBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = assignStudentDropdown.style.display === 'flex';
        assignStudentDropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            const assignYearGroupDropdown = document.getElementById('assignYearGroupDropdown');
            if (assignYearGroupDropdown) assignYearGroupDropdown.style.display = 'none';
            renderAssignPicker();
            positionAssignDropdown(assignStudentDropdown, assignStudentAddBtn, 250);
            assignStudentSearch.focus();
        }
    });

    assignStudentSearch.addEventListener('input', (e) => {
        renderAssignPicker(e.target.value);
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!assignStudentDropdown.contains(e.target) && e.target !== assignStudentAddBtn) {
            assignStudentDropdown.style.display = 'none';
        }
        const ygDropdown = document.getElementById('assignYearGroupDropdown');
        const ygBtn = document.getElementById('assignYearGroupBtn');
        if (ygDropdown && ygBtn && !ygDropdown.contains(e.target) && e.target !== ygBtn && !ygBtn.contains(e.target)) {
            ygDropdown.style.display = 'none';
        }
    });

    // Add Year Group Logic
    const assignYearGroupBtn = document.getElementById('assignYearGroupBtn');
    const assignYearGroupDropdown = document.getElementById('assignYearGroupDropdown');
    if (assignYearGroupBtn && assignYearGroupDropdown) {
        assignYearGroupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = assignYearGroupDropdown.style.display === 'flex';
            assignYearGroupDropdown.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                assignStudentDropdown.style.display = 'none';
                positionAssignDropdown(assignYearGroupDropdown, assignYearGroupBtn, 140);
            }
        });

        document.querySelectorAll('#assignYearGroupList .picker-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const yg = parseInt(item.dataset.yg);
                const ygStudents = state.students.filter(s => s.year_group == yg && eligibleForActivity(s));
                ygStudents.forEach(s => {
                    if (!assignStudentIds.includes(s.id) && eligibleForActivity(s)) {
                        assignStudentIds.push(s.id);
                    }
                });
                renderAssignTags();
                assignYearGroupDropdown.style.display = 'none';
            });
        });
    }

    // Department Selector Logic
    const departments = ['Computing', 'Health', 'Sport', 'Science', 'Maths', 'English', 'Other'];
    let selectedDepartments = new Set(['Other']);

    function renderDepartmentSelector() {
        departmentSelector.innerHTML = '';
        departments.forEach(dept => {
            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.style.cursor = 'pointer';
            chip.style.userSelect = 'none';
            
            const isSelected = selectedDepartments.has(dept);
            if (isSelected) {
                chip.style.background = 'var(--accent)';
                chip.style.color = 'white';
                chip.style.borderColor = 'var(--accent)';
            } else {
                chip.style.background = 'var(--bg-app)';
                chip.style.color = 'var(--text-primary)';
            }

            chip.textContent = dept;
            chip.onclick = () => toggleDepartment(dept);
            departmentSelector.appendChild(chip);
        });
        activityDepartmentInput.value = Array.from(selectedDepartments).join(',');
    }

    function toggleDepartment(dept) {
        if (dept === 'Other') {
            selectedDepartments.clear();
            selectedDepartments.add('Other');
        } else {
            if (selectedDepartments.has('Other')) {
                selectedDepartments.delete('Other');
            }
            
            if (selectedDepartments.has(dept)) {
                selectedDepartments.delete(dept);
                if (selectedDepartments.size === 0) {
                    selectedDepartments.add('Other');
                }
            } else {
                selectedDepartments.add(dept);
            }
        }
        renderDepartmentSelector();
    }

    function renderRegister() {
        if (!selectedActivity) {
            registerArea.innerHTML = '<div class="empty-state">Select an activity from the sidebar to view the register.</div>';
            return;
        }
        const act = state.activities.find(x => x.id == selectedActivity);
        const sessions = activityScope === 'event' ? 1 : act.sessions_per_week;
        const showMandatory = !!Number(act.all_students_mandatory) || (act.has_mandatory === undefined ? true : !!Number(act.has_mandatory));
        currentRegisterHasMandatory = showMandatory;

        // Filter students based on activity association
        // If student_ids is undefined (legacy), show all? Or show none?
        // Let's assume if the array exists, we filter. If it's missing, we show all (backward compat)
        // But we just added it to DB, so it will be empty array for existing activities.
        // User wants "only shows certain students". So empty array = no students.
        const activityStudents = activityScope === 'event' ? act.participants.filter(p => Number(p.active) || showEventHistory) : (act.student_ids || []).map(id => state.students.find(s => s.id == id)).filter(Boolean);

        // Sort by name
        activityStudents.sort((a, b) => a.name.localeCompare(b.name));

        currentRegisterStudents = activityStudents;
        if (focusedRow >= currentRegisterStudents.length) {
            focusedRow = Math.max(0, currentRegisterStudents.length - 1);
        }

        const table = document.createElement('table');
        table.className = 'students-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.innerHTML = `<th>Student</th>` + (showMandatory ? `<th>Mandatory</th>` : ``) + Array.from({ length: sessions }).map((_, i) => `<th>${activityScope === 'event' ? 'Attended' : 'Session '+(i + 1)}</th>`).join('');
        thead.appendChild(headRow); table.appendChild(thead);
        const tbody = document.createElement('tbody');

        if (activityStudents.length === 0) {
            const tr = document.createElement('tr');
            const cols = 1 + sessions + (showMandatory ? 1 : 0);
            tr.innerHTML = `<td colspan="${cols}" style="text-align:center; color:var(--text-secondary); padding: 20px;">No students assigned to this activity. Edit activity to add students.</td>`;
            tbody.appendChild(tr);
        }

        activityStudents.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'student-row' + (idx === focusedRow ? ' focused' : '');

            const nameTd = document.createElement('td');

            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'space-between';
            wrapper.style.width = '100%';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = s.name;
            wrapper.appendChild(nameSpan);

            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn';
            editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
            editBtn.style.opacity = '0.5';
            editBtn.style.padding = '4px';
            editBtn.onclick = (e) => { e.stopPropagation(); if (activityScope === 'event') { openEventNotes(act, s); } else openEditStudentModal(s, { context: 'activity' }); };
            editBtn.onmouseover = () => editBtn.style.opacity = '1';
            editBtn.onmouseout = () => editBtn.style.opacity = '0.5';

            editBtn.title = activityScope === 'event' ? 'Edit student notes' : 'Edit student';
            if (activityScope !== 'whole_school') wrapper.appendChild(editBtn);
            else if (act.student_meta?.[String(s.id)]?.note) { const note = document.createElement('small'); note.textContent = act.student_meta[String(s.id)].note; wrapper.appendChild(note); }
            if (activityScope === 'event' && !Number(s.active)) nameSpan.textContent += ' (historical)';
            nameTd.appendChild(wrapper);
            tr.appendChild(nameTd);
            const meta = (act.student_meta && act.student_meta[String(s.id)]) ? act.student_meta[String(s.id)] : null;

            if (showMandatory) {
                // Mandatory (per activity)
                const mandatoryTd = document.createElement('td');
                const mandatoryCb = document.createElement('input');
                mandatoryCb.type = 'checkbox';
                mandatoryCb.checked = !!Number(act.all_students_mandatory) || !!(meta && meta.mandatory);
                mandatoryCb.disabled = activityScope !== 'normal' || !!Number(act.all_students_mandatory);
                mandatoryCb.addEventListener('change', async () => {
                    const existingNote = (meta && typeof meta.note === 'string') ? meta.note : '';
                    const ok = await updateActivityStudentMeta(selectedActivity, s.id, { mandatory: mandatoryCb.checked ? 1 : 0, note: existingNote });
                    if (!ok) {
                        // revert
                        mandatoryCb.checked = !mandatoryCb.checked;
                    }
                });
                mandatoryTd.appendChild(mandatoryCb);
                tr.appendChild(mandatoryTd);
            }

            for (let si = 1; si <= sessions; si++) {
                const td = document.createElement('td');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                const present = state.attendance[s.id] && state.attendance[s.id][si] === 1;
                cb.checked = !!present;
                cb.disabled = activityScope === 'whole_school';
                cb.setAttribute('aria-label', `${s.name}: attended`);
                cb.addEventListener('change', () => toggleAttendance(s.id, si, cb.checked));
                td.appendChild(cb);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        registerArea.innerHTML = '';
        if (activityScope === 'event' && act.participants.some(p => !Number(p.active))) {
            const history = document.createElement('button'); history.className = 'btn event-history-control';
            history.textContent = showEventHistory ? 'Hide historical participants' : 'Show historical participants';
            history.onclick = () => { showEventHistory = !showEventHistory; renderRegister(); };
            registerArea.appendChild(history);
        }
        registerArea.appendChild(table);
    }

    async function toggleAttendance(student_id, session_index, present) {
        const requestedActivity = selectedActivity;
        const requestedWeek = selectedWeekStart;
        const res = await api('toggle_attendance', 'POST', { student_id, activity_id: selectedActivity, week_start: selectedWeekStart, session_index, present: present ? 1 : 0 });
        if (res.stale || requestedActivity !== selectedActivity || requestedWeek !== selectedWeekStart) return;
        if (res.error) { alert(res.error); await loadAttendance(); return; }
        if (!state.attendance[student_id]) state.attendance[student_id] = {};
        state.attendance[student_id][session_index] = present ? 1 : 0;
    }

    let eventNoteTarget = null;
    function openEventNotes(activity, student) {
        eventNoteTarget = { activity, student };
        q('#eventNoteTitle').textContent = `${student.name} — Event notes`;
        q('#eventNoteText').value = activity.student_meta[String(student.id)]?.note || '';
        openModal(q('#eventNoteModal'));
        q('#eventNoteText').focus();
    }
    q('#eventNoteForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!eventNoteTarget) return;
        const {activity, student} = eventNoteTarget;
        q('#saveEventNote').disabled = true;
        try {
            if (await updateActivityStudentMeta(activity.id, student.id, {note: q('#eventNoteText').value, mandatory: student.mandatory})) closeModal(q('#eventNoteModal'));
        } finally { q('#saveEventNote').disabled = false; }
    });

    async function updateActivityStudentMeta(activity_id, student_id, { mandatory, note }) {
        const res = await api('update_activity_student', 'POST', {
            activity_id,
            student_id,
            ...(activityScope === 'event' || Number(state.activities.find(a => a.id == activity_id)?.all_students_mandatory) ? {} : { mandatory: mandatory ? 1 : 0 }),
            note: note ?? ''
        });
        if (res.stale) return;
        if (res && res.ok) {
            const act = state.activities.find(x => x.id == activity_id);
            if (act) {
                if (!act.student_meta) act.student_meta = {};
                act.student_meta[String(student_id)] = { mandatory: mandatory ? 1 : 0, note: note ?? '' };
            }
            return true;
        }
        alert(res.error || 'Failed to update');
        return false;
    }

    activityForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = activityIdInput.value;
        const name = activityNameInput.value.trim();
        const description = activityDescriptionInput.value.trim();
        const department = activityDepartmentInput.value;
        const sessions = activitySessionsInput.value;
        const has_mandatory = activityHasMandatoryInput && activityHasMandatoryInput.checked ? 1 : 0;

        if (!name) return;

        const fields = activityScope === 'event' ? eventForm.get() : { sessions_per_week: sessions, has_mandatory, student_ids: currentActivityStudentIds.join(',') };
        saveActivityBtn.disabled = true;
        let res;
        try { res = await api(id ? 'update_activity' : 'create_activity', 'POST', { ...(id ? {id} : {}), name, description, department, ...fields }); }
        finally { saveActivityBtn.disabled = false; }

        if (res.stale) return;
        if (res.ok) {
            closeModal(activityModal);
            await loadState();
            if (id) {
                selectActivity(id); // Refresh current view
            } else {
                selectActivity(res.id); // Select new
            }
        } else alert(res.error || 'Failed');
    });

    if (can.admin) deleteActivityBtn.addEventListener('click', async () => {
        const id = activityIdInput.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this activity? All attendance data will be lost.')) return;

        const res = await api('delete_activity', 'POST', { id });
        if (res.stale) return;
        if (res.ok) {
            closeModal(activityModal);
            selectedActivity = null;
            activityTitle.textContent = 'Select Activity';
            editActivityBtn.style.display = 'none';
            registerArea.innerHTML = '<div class="empty-state">Select an activity from the sidebar to view the register.</div>';
            await loadState();
        } else {
            alert(res.error || 'Failed to delete');
        }
    });

    // Modal Logic
    function openModal(modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        const input = modal.querySelector('input');
        if (input) input.focus();
    }

    function openCreateActivityModal() {
        if (!can.head) return;
        activityIdInput.value = '';
        activityNameInput.value = '';
        activityDescriptionInput.value = '';
        activitySessionsInput.value = '1';
        if (activityHasMandatoryInput) activityHasMandatoryInput.checked = true;
        activityModalTitle.textContent = activityScope === 'event' ? 'New Event' : 'New Activity';
        saveActivityBtn.textContent = activityScope === 'event' ? 'Create Event' : 'Create Activity';
        deleteActivityBtn.style.display = 'none';

        selectedDepartments.clear();
        selectedDepartments.add('Other');
        renderDepartmentSelector();

        currentActivityStudentIds = [];
        configureSchoolForm();
        renderStudentTags();

        closeMobileNavigation();
        openModal(activityModal);
    }

    function openEditActivityModal() {
        if (!can.head) return;
        if (!selectedActivity) return;
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        activityIdInput.value = act.id;
        activityNameInput.value = act.name;
        activityDescriptionInput.value = act.description || '';
        activitySessionsInput.value = act.sessions_per_week;
        if (activityHasMandatoryInput) activityHasMandatoryInput.checked = (act.has_mandatory === undefined) ? true : !!parseInt(act.has_mandatory, 10);
        activityModalTitle.textContent = activityScope === 'event' ? 'Edit Event' : 'Edit Activity';
        saveActivityBtn.textContent = 'Save Changes';
        deleteActivityBtn.style.display = can.admin ? 'block' : 'none';

        selectedDepartments.clear();
        if (act.department) {
            act.department.split(',').forEach(d => selectedDepartments.add(d.trim()));
        } else {
            selectedDepartments.add('Other');
        }
        renderDepartmentSelector();

        currentActivityStudentIds = [...(act.student_ids || [])];
        configureSchoolForm(act);
        renderStudentTags();

        closeMobileNavigation();
        openModal(activityModal);
    }

    function closeModal(modal) {
        if (typeof csvBusy !== 'undefined' && csvBusy && (!modal || modal === csvImportModal)) return;
        // If no modal passed, close all active ones
        if (!modal) {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
            return;
        }
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        if (modal === assignStudentModal) {
            assignStudentDropdown.style.display = 'none';
            const assignYearGroupDropdown = document.getElementById('assignYearGroupDropdown');
            if (assignYearGroupDropdown) assignYearGroupDropdown.style.display = 'none';
        }
        const form = modal.querySelector('form');
        if (form) form.reset();
    }

    const studentCharacteristicFields = ['pp', 'fsm_ever', 'gender', 'sen_status'];
    function setStudentCharacteristics(student) {
        studentCharacteristicFields.forEach(field => {
            const control = q(`#student_${field}`);
            control.value = student[field] == null ? '' : String(student[field]);
            control.disabled = false;
        });
    }
    function studentCharacteristics() {
        return Object.fromEntries(studentCharacteristicFields.map(field => [field, q(`#student_${field}`).value]));
    }
    function openCreateStudentModal() {
        if (!can.admin) return;
        studentIdInput.value = '';
        if (studentActivityIdInput) studentActivityIdInput.value = '';
        if (studentEditContextInput) studentEditContextInput.value = 'global';
        firstNameInput.value = '';
        lastNameInput.value = '';
        studentYearGroup.value = '9';
        setStudentCharacteristics({});
        uploadCsvLink.parentElement.hidden = !can.admin;
        if (studentMandatoryInput) studentMandatoryInput.checked = false;
        if (studentNoteInput) studentNoteInput.value = '';
        studentModalTitle.textContent = 'Add New Student';
        saveStudentBtn.textContent = 'Add Student';
        deleteStudentBtn.style.display = 'none';

        document.querySelectorAll('.activity-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.activity-mandatory').forEach(el => el.style.display = 'none');
        openModal(studentModal);
    }

    function openEditStudentModal(student, opts = {}) {
        const context = opts.context || 'global';
        const isActivityContext = context === 'activity' && !!selectedActivity;

        // Only admins can edit students globally (via Settings).
        // Teachers/Heads can edit assigned students from the activity page.
        if (!can.admin && !isActivityContext) return;

        studentIdInput.value = student.id;
        if (studentActivityIdInput) studentActivityIdInput.value = isActivityContext ? String(selectedActivity) : '';
        if (studentEditContextInput) studentEditContextInput.value = isActivityContext ? 'activity' : 'global';

        const parts = student.name.split(' ');
        firstNameInput.value = parts[0] || '';
        lastNameInput.value = parts.slice(1).join(' ') || '';
        studentYearGroup.value = student.year_group || '9';
        setStudentCharacteristics(student);
        uploadCsvLink.parentElement.hidden = true;

        if (isActivityContext) {
            const act = state.activities.find(x => x.id == selectedActivity);
            const meta = (act && act.student_meta && act.student_meta[String(student.id)]) ? act.student_meta[String(student.id)] : null;
            if (studentMandatoryInput) {
                studentMandatoryInput.checked = !!Number(act.all_students_mandatory) || !!(meta && meta.mandatory);
                studentMandatoryInput.disabled = !!Number(act.all_students_mandatory);
            }
            if (studentNoteInput) studentNoteInput.value = (meta && typeof meta.note === 'string') ? meta.note : '';

            const showMandatory = !!Number(act.all_students_mandatory) || !!Number(act.has_mandatory);
            document.querySelectorAll('.activity-mandatory').forEach(el => el.style.display = showMandatory ? 'flex' : 'none');
        } else {
            if (studentMandatoryInput) studentMandatoryInput.checked = false;
            if (studentNoteInput) studentNoteInput.value = '';
        }

        document.querySelectorAll('.activity-only').forEach(el => el.style.display = isActivityContext ? 'flex' : 'none');

        // Allow teacher/head to edit student record only when invoked from an activity.
        const canEditStudentRecord = can.admin || (isActivityContext && (role === 'teacher' || role === 'head'));
        firstNameInput.disabled = !canEditStudentRecord;
        lastNameInput.disabled = !canEditStudentRecord;
        studentYearGroup.disabled = !canEditStudentRecord;
        studentCharacteristicFields.forEach(field => q(`#student_${field}`).disabled = !canEditStudentRecord);

        studentModalTitle.textContent = isActivityContext ? 'Edit Student (This Activity)' : 'Edit Student';
        saveStudentBtn.textContent = 'Save Changes';
        deleteStudentBtn.style.display = (can.admin && !isActivityContext) ? 'block' : 'none';
        openModal(studentModal);
    }

    assignStudentBtn.addEventListener('click', () => {
        if (!selectedActivity) return;
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        assignStudentIds = [...(act.student_ids || [])];
        renderAssignTags();
        openModal(assignStudentModal);
    });

    assignStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        const hasMandatory = (act.has_mandatory === undefined) ? 1 : (parseInt(act.has_mandatory, 10) ? 1 : 0);

        const res = await api('update_activity', 'POST', {
            id: act.id,
            name: act.name,
            description: act.description || '',
            department: act.department || 'Other',
            sessions_per_week: act.sessions_per_week,
            has_mandatory: hasMandatory,
            student_ids: assignStudentIds.join(',')
        });
        if (res.stale) return;
        if (res.ok) {
            closeModal(assignStudentModal);
            await loadState();
            await loadAttendance(); // Refresh register
        } else {
            alert(res.error || 'Failed to update students');
        }
    });

    if (can.admin) createStudentBtn.addEventListener('click', openCreateStudentModal);
    if (can.head && addActivityBtn) addActivityBtn.addEventListener('click', openCreateActivityModal);
    if (can.head && editActivityBtn) editActivityBtn.addEventListener('click', openEditActivityModal);

    closeModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        closeModal(modal);
    }));

    // Close on click outside
    [studentModal, activityModal, assignStudentModal, q('#studentStatsModal'), q('#activityStatsModal')].forEach(m => {
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m) closeModal(m);
        });
    });

    // Close on Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // --- Student Stats Logic ---
    const studentStatsModal = q('#studentStatsModal');
    const studentStatsTitle = q('#studentStatsTitle');
    const studentTotalSessions = q('#studentTotalSessions');
    const studentTotalActivities = q('#studentTotalActivities');
    const studentActivityList = q('#studentActivityList');
    const studentHistoryList = q('#studentHistoryList');
    const downloadStudentCsvBtn = q('#downloadStudentCsvBtn');
    let currentStatsStudent = null;

    async function openStudentStats(student) {
        currentStatsStudent = student;
        studentStatsTitle.textContent = `${student.name} — ${scopeLabel()}`;

        const res = await api('get_student_stats', 'GET', { id: student.id });
        if (res.stale) return;
        if (res.error) return alert(res.error);
        const stats = res.stats;

        studentTotalSessions.textContent = stats.total;
        studentTotalActivities.textContent = Object.keys(stats.by_activity).length;

        // Activity List
        studentActivityList.innerHTML = '';
        Object.entries(stats.by_activity).forEach(([name, count]) => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${name}</span><span style="font-weight:600">${count}</span>`;
            studentActivityList.appendChild(div);
        });

        // History List
        studentHistoryList.innerHTML = '';
        stats.history.forEach(h => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.fontSize = '13px';
            div.innerHTML = `
            <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-size:11px; margin-bottom:2px;">
                <span>${h.week_start}</span>
                <span>${activityScope === 'event' ? 'Attended' : 'Session '+h.session_index}</span>
            </div>
            <div>${h.activity_name}</div>
          `;
            studentHistoryList.appendChild(div);
        });

        openModal(studentStatsModal);
    }

    downloadStudentCsvBtn.addEventListener('click', async () => {
        if (!currentStatsStudent) return;
        const res = await api('get_student_stats', 'GET', { id: currentStatsStudent.id });
        if (res.stale) return;
        const stats = res.stats;

        let csv = `Title,Value\n`;
        csv += `Student Name,"${currentStatsStudent.name}"\n`;
        
        // Activities Part Of
        const inActivities = state.activities.filter(a => (a.student_ids || []).includes(currentStatsStudent.id));
        const actNames = inActivities.map(a => a.name).join(', ');
        csv += `Selected ${activityScope === 'event' ? 'Events' : 'Activities'},"${actNames}"\n`;
        
        csv += `Total ${activityScope === 'event' ? 'Events' : 'Sessions'},${stats.total}\n`;

        // Group history by week
        const weeklyData = {};
        stats.history.forEach(h => {
            if (!weeklyData[h.week_start]) weeklyData[h.week_start] = {};
            if (!weeklyData[h.week_start][h.activity_name]) weeklyData[h.week_start][h.activity_name] = 0;
            weeklyData[h.week_start][h.activity_name]++;
        });

        // Sort weeks
        const weeks = Object.keys(weeklyData).sort();
        
        weeks.forEach(w => {
            const activities = Object.entries(weeklyData[w])
                .map(([name, count]) => `${name} * ${count}`)
                .join(', ');
            csv += `${activityScope === "event" ? "" : "W/C "}${formatCsvDate(w)},"${activities}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activityScope === 'whole_school' ? 'archived_whole_school' : activityScope}_${currentStatsStudent.name.replace(/\s+/g, '_')}_report.csv`;
        a.click();
    });

    // --- Activity Stats Logic ---
    const activityStatsModal = q('#activityStatsModal');
    const activityStatsTitle = q('#activityStatsTitle');
    const activityTotalAttendance = q('#activityTotalAttendance');
    const activityStudentList = q('#activityStudentList');
    const downloadActivityCsvBtn = q('#downloadActivityCsvBtn');
    let currentStatsActivity = null;
    let activityTrendChartInstance = null;

    async function openActivityStats(activityId) {
        const act = state.activities.find(a => a.id == activityId);
        if (!act) return;
        currentStatsActivity = act;
        activityStatsTitle.textContent = `${act.name} — ${scopeLabel()}`;

        const res = await api('get_activity_stats', 'GET', { id: act.id });
        if (res.stale) return;
        if (res.error) return alert(res.error);
        const stats = res.stats;

        activityTotalAttendance.textContent = stats.total;

        // Student List
        activityStudentList.innerHTML = '';
        Object.entries(stats.by_student).forEach(([name, count]) => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${name}</span><span style="font-weight:600">${count}</span>`;
            activityStudentList.appendChild(div);
        });

        // Chart
        const ctx = q('#activityTrendChart').getContext('2d');
        if (activityTrendChartInstance) activityTrendChartInstance.destroy();

        activityTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: stats.weekly.map(x => x.week_start),
                datasets: [{
                    label: 'Attendance',
                    data: stats.weekly.map(x => x.count),
                    borderColor: '#34c759',
                    backgroundColor: 'rgba(52, 199, 89, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } }
            }
        });

        openModal(activityStatsModal);
    }

    downloadActivityCsvBtn.addEventListener('click', async () => {
        if (!currentStatsActivity) return;
        const res = await api('get_activity_export', 'GET', { id: currentStatsActivity.id });
        if (res.stale) return;
        if (res.error) return alert(res.error);
        
        const rawData = res.data;
        
        // 1. Get all unique weeks and sort them
        const weeksSet = new Set();
        rawData.forEach(r => weeksSet.add(r.week_start));
        const weeks = Array.from(weeksSet).sort();
        
        // 2. Map attendance data
        const attendanceMap = {};
        rawData.forEach(r => {
            if (!attendanceMap[r.student_id ?? r.student_name]) {
                attendanceMap[r.student_id ?? r.student_name] = {
                    name: r.student_name,
                    weeks: {},
                    total: 0
                };
            }
            const count = parseInt(r.count);
            attendanceMap[r.student_id ?? r.student_name].weeks[r.week_start] = (attendanceMap[r.student_id ?? r.student_name].weeks[r.week_start] || 0) + count;
            attendanceMap[r.student_id ?? r.student_name].total += count;
        });

        // 3. Build CSV
        let csv = 'Student Name,' + weeks.map(w => `${activityScope === "event" ? "" : "W/C "}${formatCsvDate(w)}`).join(',') + `,Total ${activityScope === 'event' ? 'Events' : 'Sessions'} Attended\n`;
        
        // Sort students by name
        const studentNames = Object.keys(attendanceMap).sort((a,b) => attendanceMap[a].name.localeCompare(attendanceMap[b].name));
        
        studentNames.forEach(name => {
            const data = attendanceMap[name];
            const weekCols = weeks.map(w => data.weeks[w] || 0).join(',');
            csv += `"${data.name.replaceAll('"', '""')}",${weekCols},${data.total}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activityScope === 'whole_school' ? 'archived_whole_school' : activityScope}_${currentStatsActivity.name.replace(/\s+/g, '_')}_report.csv`;
        a.click();
    });

    // Update renderStatsTable to be clickable
    function renderStatsTable(filter = '') {
        statsTable.innerHTML = '';
        const term = filter.trim().toLowerCase();

        if (!term) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="3" style="text-align:center; padding: 20px; color: var(--text-secondary);">${reportStudents().length} students. Type to search.</td>`;
            statsTable.appendChild(tr);
            return;
        }

        reportStudents().forEach(s => {
            if (!s.name.toLowerCase().includes(term)) return;

            const attended = statsData.students[s.id] || 0;

            // Find which activities they are in
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join(', ');

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.className = 'student-row';
            tr.onclick = () => openStudentStats(s);

            tr.innerHTML = `
            <td>${s.name}</td>
            <td>${attended}</td>
            <td>${actNames || '<span style="color:var(--text-secondary)">None</span>'}</td>
          `;
            statsTable.appendChild(tr);
        });
    }

    // Update renderCharts to be clickable
    function renderCharts() {
        const ctxWeekly = q('#chartWeekly').getContext('2d');
        const ctxActivities = q('#chartActivities').getContext('2d');

        // Destroy existing
        if (chartWeekly) chartWeekly.destroy();
        if (chartActivities) chartActivities.destroy();

        // Weekly Data
        const weeks = statsData.weekly.map(x => x.week_start);
        const weekCounts = statsData.weekly.map(x => x.count);

        chartWeekly = new Chart(ctxWeekly, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Attendance',
                    data: weekCounts,
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });

        // Activity Data
        const actLabels = [];
        const actCounts = [];
        const actIds = [];
        state.activities.forEach(a => {
            actLabels.push(a.name);
            actCounts.push(statsData.activities[a.id] || 0);
            actIds.push(a.id);
        });

        chartActivities = new Chart(ctxActivities, {
            type: 'bar',
            data: {
                labels: actLabels,
                datasets: [{
                    label: activityScope === 'event' ? 'Events' : 'Sessions',
                    data: actCounts,
                    backgroundColor: [
                        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#af52de'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const activityId = actIds[index];
                        openActivityStats(activityId);
                    }
                }
            }
        });
    }

    studentForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = studentIdInput.value;
        const first = firstNameInput.value.trim();
        const last = lastNameInput.value.trim();
        const yearGroup = studentYearGroup.value;
        if (!first || !last) return;

        const fullName = `${first} ${last}`;

        const editContext = studentEditContextInput ? studentEditContextInput.value : 'global';
        const activityId = studentActivityIdInput ? parseInt(studentActivityIdInput.value || '0', 10) : 0;

        // If editing from an activity, always save per-activity metadata.
        if (editContext === 'activity' && id && activityId) {
            const mandatory = studentMandatoryInput && studentMandatoryInput.checked ? 1 : 0;
            const note = studentNoteInput ? studentNoteInput.value : '';
            const ok = await updateActivityStudentMeta(activityId, parseInt(id, 10), { mandatory, note });
            if (!ok) return;
        }

        let res;
        if (id) {
            const payload = { id, name: fullName, year_group: yearGroup, ...studentCharacteristics() };
            if (!can.admin && activityId) payload.activity_id = activityId;
            res = await api('update_student', 'POST', payload);
        } else {
            res = await api('create_student', 'POST', { name: fullName, year_group: yearGroup, ...studentCharacteristics() });
        }

        if (res.stale) return;
        if (res.ok) {
            closeModal(studentModal);
            await loadState();
            await loadAttendance();
            
            // If we are in settings view, refresh it
            if (settingsArea.style.display !== 'none') {
                renderSettings();
            }
        } else alert(res.error || 'Failed');
    });

    deleteStudentBtn.addEventListener('click', async () => {
        const id = studentIdInput.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this student? All their attendance data will be lost.')) return;

        const res = await api('delete_student', 'POST', { id });
        if (res.stale) return;
        if (res.ok) {
            closeModal(studentModal);
            await loadState();
            await loadAttendance();
        } else {
            alert(res.error || 'Failed to delete');
        }
    });

    weekStartInput.addEventListener('change', async e => {
        // Native change event might trigger if flatpickr doesn't suppress it, 
        // but we handle it in flatpickr config below.
        // Keeping this for fallback if flatpickr fails to load.
        if (!weekStartInput._flatpickr) {
            selectedWeekStart = weekStartInput.value;
            await loadAttendance();
        }
    });

    // Initialize Flatpickr
    if (window.flatpickr) {
        flatpickr(weekStartInput, {
            dateFormat: "Y-m-d",
            defaultDate: isoMonday(),
            disableMobile: "true",
            plugins: [new weekSelect({})],
            locale: {
                firstDayOfWeek: 1 // Start week on Monday
            },
            altInput: true,
            altFormat: "\\W\\e\\e\\k \\o\\f F j, Y", // "Week of December 4, 2023"
            onChange: async function (selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    // The weekSelect plugin sets the date to the start of the week
                    const d = selectedDates[0];
                    // Ensure we have the ISO string for the API
                    // Adjust to local Monday to avoid timezone issues if necessary, 
                    // but flatpickr usually handles this well with the plugin.
                    // Let's use our isoMonday helper to be safe and consistent with the backend expectation.
                    const monday = isoMonday(d);

                    if (monday !== selectedWeekStart) {
                        selectedWeekStart = monday;
                        await loadAttendance();
                    }
                }
            }
        });
    }

    // keyboard navigation
    window.addEventListener('keydown', e => {
        const table = registerArea.querySelector('.students-table');
        if (!table || registerArea.style.display === 'none' || activityScope === 'whole_school' || document.querySelector('.modal-overlay.active')) return;
        // Only capture navigation keys if we aren't in an input or textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        if (['ArrowUp', 'ArrowDown', ' '].includes(e.key) || /^[1-7]$/.test(e.key)) {
            e.preventDefault();
        }
        if (e.key === 'ArrowUp') { focusedRow = Math.max(0, focusedRow - 1); renderRegister(); }
        if (e.key === 'ArrowDown') { focusedRow = Math.min(currentRegisterStudents.length - 1, focusedRow + 1); renderRegister(); }
        if (e.key === ' ') { // toggle session 1 (skip mandatory column)
            const s = currentRegisterStudents[focusedRow];
            if (!s) return;
            const row = document.querySelectorAll('.students-table tbody tr')[focusedRow];
            if (!row) return;
            const inputs = row.querySelectorAll('input');
            const offset = currentRegisterHasMandatory ? 1 : 0;
            const cb = inputs[offset];
            if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
        if (activityScope === 'normal' && /^[1-7]$/.test(e.key)) {
            const si = parseInt(e.key, 10);
            const s = currentRegisterStudents[focusedRow];
            if (!s) return;
            const row = document.querySelectorAll('.students-table tbody tr')[focusedRow];
            if (!row) return;
            const inputs = row.querySelectorAll('input');
            const offset = currentRegisterHasMandatory ? 1 : 0;
            const idx = offset + (si - 1);
            if (idx < inputs.length) {
                const cb = inputs[idx];
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            }
        }
    });

    // CSV decoding, explicit mapping and create-only confirmation.
    const uploadCsvLink = q('#uploadCsvLink');
    const csvUpload = q('#csvUpload');
    const csvImportModal = q('#csvImportModal');
    let csvRecords = [], csvConfig = null, csvRows = [], csvBusy = false;
    function csvError(message) {
        q('#csvImportError').textContent = message;
        q('#csvImportError').hidden = !message;
    }
    function refreshCsvPreview() {
        csvError('');
        csvRows = [];
        try {
            csvRows = StudentCsv.mapRows(csvRecords, csvConfig);
            q('#csvImportSummary').textContent = `${csvRows.length} new students will be created. Previewing the first ${Math.min(10, csvRows.length)}.`;
        } catch (error) {
            csvError(error.message);
            q('#csvImportSummary').textContent = 'Check the column mapping.';
        }
        q('#confirmCsvImport').disabled = !csvRows.length || csvBusy;
        const table = q('#csvPreview'); table.replaceChildren();
        const headers = ['CSV row', 'Name', 'Year', 'PP', 'FSM', 'Gender', 'SEN'];
        const thead = table.createTHead().insertRow();
        headers.forEach(text => { const th = document.createElement('th'); th.textContent = text; thead.appendChild(th); });
        const tbody = table.createTBody();
        csvRows.slice(0, 10).forEach(row => {
            const tr = tbody.insertRow();
            [row.row_number, row.name, row.year_group, row.pp || 'Not recorded', row.fsm_ever || 'Not recorded', row.gender || 'Not recorded', row.sen_status === '' ? 'No needs' : (row.sen_status ?? 'Not recorded')].forEach(value => { tr.insertCell().textContent = value; });
        });
    }
    function renderCsvMappings() {
        q('#csvMappings').replaceChildren();
        const count = Math.max(...csvRecords.map(row => row.cells.length));
        for (const [field, label] of Object.entries(StudentCsv.fields)) {
            const group = document.createElement('div'); group.className = 'form-group';
            const title = document.createElement('label'); title.textContent = label; title.htmlFor = `csvMap_${field}`;
            const select = document.createElement('select'); select.id = title.htmlFor;
            select.add(new Option('Not mapped', '-1'));
            for (let i = 0; i < count; i++) select.add(new Option(csvConfig.hasHeader ? `${i + 1}: ${csvRecords[0].cells[i] || 'Untitled'}` : `Column ${i + 1}`, String(i)));
            select.value = String(csvConfig.mapping[field]);
            select.addEventListener('change', () => {
                csvConfig.mapping[field] = Number(select.value);
                if (select.value !== '-1') {
                    if (field === 'name') { csvConfig.mapping.first_name = -1; csvConfig.mapping.last_name = -1; }
                    if (field === 'first_name' || field === 'last_name') csvConfig.mapping.name = -1;
                }
                renderCsvMappings();
            });
            group.append(title, select); q('#csvMappings').appendChild(group);
        }
        q('#csvHasHeader').checked = csvConfig.hasHeader;
        q('#csvNameOrder').value = csvConfig.nameOrder;
        refreshCsvPreview();
    }
    if (can.admin) uploadCsvLink.addEventListener('click', event => { event.preventDefault(); csvUpload.click(); });
    if (can.admin) csvUpload.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            csvRecords = StudentCsv.parse(await file.text());
            csvConfig = StudentCsv.infer(csvRecords);
            closeModal(studentModal);
            renderCsvMappings();
            openModal(csvImportModal);
        } catch (error) { alert(error.message); }
        csvUpload.value = '';
    });
    q('#csvHasHeader').addEventListener('change', event => {
        csvConfig = StudentCsv.infer(csvRecords, event.target.checked); renderCsvMappings();
    });
    q('#csvNameOrder').addEventListener('change', event => { csvConfig.nameOrder = event.target.value; refreshCsvPreview(); });
    q('#csvImportForm').addEventListener('submit', async event => {
        event.preventDefault();
        if (!can.admin || csvBusy || !csvRows.length) return;
        csvBusy = true; csvError('');
        const controls = csvImportModal.querySelectorAll('button, input, select');
        controls.forEach(control => control.disabled = true);
        q('#confirmCsvImport').textContent = 'Importing…';
        try {
            const res = await api('import_students', 'POST', { rows: JSON.stringify(csvRows) });
            if (res.stale) return;
            if (res.error) { csvError(res.error); return; }
            csvBusy = false;
            closeModal(csvImportModal);
            await loadState(); await loadAttendance();
            alert(`Successfully created ${res.created} students.`);
            csvRows = [];
        } catch (error) {
            csvError('Import response could not be received. Check the student list before retrying to avoid duplicates.');
        } finally {
            csvBusy = false;
            controls.forEach(control => control.disabled = false);
            q('#confirmCsvImport').textContent = 'Import students';
            q('#confirmCsvImport').disabled = !csvRows.length;
        }
    });

    // theme
    function loadTheme() {
        const root = document.documentElement;
        const t = localStorage.getItem('theme') || 'dark';
        if (t === 'light') root.classList.add('light'); else root.classList.remove('light');
    }
    toggleThemeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        root.classList.toggle('light');
        localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
    });

    // init
    (async function () {
        loadTheme();
        applyRoleGating();
        selectedWeekStart = isoMonday();
        weekStartInput.value = selectedWeekStart;
        await loadState();
    })();

})();
