<?php
/** @var string $role */
$roleLabel = 'Teacher';
if ($role === 'super_admin') $roleLabel = 'Super Admin';
if ($role === 'admin') $roleLabel = 'Admin';
if ($role === 'head') $roleLabel = 'Head of Subject';
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0" />
    <title>Enrichment Activity Recorder</title>
    <link rel="stylesheet" href="/assets/css/styles.css?v=8">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>window.__ER_ROLE__ = <?php echo json_encode($role ?? null); ?>;</script>
</head>
<body>
<div id="app" class="app-root">
    <aside class="sidebar">
        <div class="sidebar-header">
            <div class="app-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span>Recorder</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="role-badge" id="roleBadge"><?php echo htmlspecialchars($roleLabel, ENT_QUOTES, 'UTF-8'); ?></span>
                <a href="/?action=auth_logout" class="icon-btn" title="Logout" aria-label="Logout">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </a>
                <button id="toggleTheme" class="icon-btn" title="Toggle Theme">
                    <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                    <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                </button>
            </div>
        </div>
        
        <button type="button" class="mobile-nav-toggle" id="mobileNavToggle" aria-expanded="false" aria-controls="sidebarNavigation">Activities · Menu</button>
        <div class="sidebar-content" id="sidebarNavigation">
            <?php if ($role === 'super_admin'): ?>
            <div class="scope-segments" id="activityScopeSwitch" role="group" aria-label="Record type">
                <span class="scope-selection" aria-hidden="true"></span>
                <button type="button" data-scope="normal" aria-pressed="true">Activities</button>
                <button type="button" data-scope="event" aria-pressed="false">Events</button>
            </div>
            <?php endif; ?>
            <div class="nav-item" id="navStats">
                <div style="display:flex; align-items:center; gap:8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path></svg>
                    <span>Statistics</span>
                </div>
            </div>

            <div class="nav-item" id="navSettings">
                <div style="display:flex; align-items:center; gap:8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    <span>Settings</span>
                </div>
            </div>

            <div class="section-label" id="activityScopeLabel" style="margin-top: 12px;">Activities</div>
            <div id="activitiesList" class="nav-list"></div>
            
            <button id="addActivityBtn" class="btn-sidebar-action">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                New Activity
            </button>
            <?php if ($role === 'super_admin'): ?>
            <?php endif; ?>
        </div>

        <div class="sidebar-footer" id="activityWeekSection">
            <div class="week-picker">
                <label for="weekStart">Week of</label>
                <input type="date" id="weekStart">
            </div>
        </div>
    </aside>

    <main class="main-content">
        <div id="archiveControls" hidden><strong>Read-only archive</strong> <label for="archiveWeek">Recorded week</label> <select id="archiveWeek"></select></div>
        <header class="content-header">
            <div style="display:flex; align-items:center; gap:12px;">
                <div>
                    <h2 id="activityTitle">Select Activity</h2>
                    <div id="activityDescription" style="font-size:14px; color:var(--text-secondary); margin-top:4px;"></div>
                </div>
                <button id="editActivityBtn" class="icon-btn" title="Edit Activity" style="display:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </div>
            <div class="header-actions">
                <button id="createStudentBtn" class="btn-primary" style="display:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Create Student
                </button>
                <button id="assignStudentBtn" class="btn-primary" style="display:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    Assign Students
                </button>
            </div>
        </header>

        <div class="content-body">
            <div id="registerArea" class="register-container">
                <div class="empty-state">Select an activity from the sidebar to view the register.</div>
            </div>
            
            <div id="statsArea" class="stats-container" style="display:none; padding: 24px;">
                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>Total Students</h3>
                        <div class="stat-value" id="statTotalStudents">0</div>
                    </div>
                    <div class="stat-card">
                        <h3 data-activity-label="Total Activities" data-event-label="Total Events">Total Activities</h3>
                        <div class="stat-value" id="statTotalActivities">0</div>
                    </div>
                    <div class="stat-card">
                        <h3>Total Attendance</h3>
                        <div class="stat-value" id="statTotalAttendance">0</div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-card">
                        <h3 data-activity-label="Attendance by Week" data-event-label="Attendance by Date">Attendance by Week</h3>
                        <canvas id="chartWeekly"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3 data-activity-label="Top Activities" data-event-label="Top Events">Top Activities</h3>
                        <canvas id="chartActivities"></canvas>
                    </div>
                </div>

                <div class="stats-table-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h3>Student Performance</h3>
                        <button type="button" class="btn-secondary" id="downloadCsvBtn">Export attendance</button>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="statsSearch" placeholder="Search students..." style="width:200px;">
                        </div>
                    </div>
                    <table class="students-table" id="statsTable">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th data-activity-label="Sessions Attended" data-event-label="Events Attended">Sessions Attended</th>
                                <th data-activity-label="Activities" data-event-label="Events">Activities</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>

                <div class="stats-table-container" style="margin-top: 24px;">
                    <h3 data-activity-label="Activities" data-event-label="Events">Activities</h3>
                    <table class="students-table" id="statsActivitiesTable">
                        <thead>
                            <tr>
                                <th data-activity-label="Activity Name" data-event-label="Event Name">Activity Name</th>
                                <th data-activity-label="Sessions / Week" data-event-label="Event Date">Sessions / Week</th>
                                <th>Total Attendance</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>

                <div class="stats-table-container" style="margin-top: 24px;">
                    <h3>Year Groups</h3>
                    <table class="students-table" id="statsYearGroupsTable">
                        <thead>
                            <tr>
                                <th>Year Group</th>
                                <th>Total Attendance</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>

                <div class="stats-table-container" style="margin-top: 24px;">
                    <h3>Departments</h3>
                    <table class="students-table" id="statsDepartmentsTable">
                        <thead>
                            <tr>
                                <th>Department</th>
                                <th>Total Attendance</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <div id="settingsArea" class="settings-container" style="display:none; padding: 24px;">
                <div class="stat-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h3>Manage Students</h3>
                        <div style="display:flex; gap:8px;">
                            <button id="massDeleteBtn" class="btn-secondary" style="color:var(--danger); border-color:var(--danger);" disabled>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Delete Selected
                            </button>
                            <button id="massAddToActivityBtn" class="btn-primary" disabled>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                Add to Activity
                            </button>
                        </div>
                    </div>
                    <div class="table-container">
                        <table id="settingsStudentsTable" class="students-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px;"><input type="checkbox" id="selectAllStudents"></th>
                                    <th>Name</th>
                                    <th>ID</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <footer class="content-footer" id="registerKeyboardHints">
            <div class="shortcuts">
                <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
                <span><kbd>Space</kbd> Toggle</span>
                <span id="recurringSessionHint"><kbd>1</kbd>-<kbd>7</kbd> Session</span>
            </div>
        </footer>
    </main>
</div>

<!-- Student Modal -->
<div id="studentModal" class="modal-overlay" aria-hidden="true">
    <div class="modal">
        <div class="modal-header">
            <h3 id="studentModalTitle">Add New Student</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <form id="studentForm" autocomplete="off">
            <input type="hidden" id="studentIdInput" name="id">
            <input type="hidden" id="studentActivityIdInput" name="activity_id">
            <input type="hidden" id="studentEditContextInput" name="edit_context">
            <div class="modal-body">
                <div class="form-group">
                    <label for="firstName">First Name</label>
                    <input id="firstName" name="firstName" placeholder="e.g. John" required>
                </div>
                <div class="form-group">
                    <label for="lastName">Last Name</label>
                    <input id="lastName" name="lastName" placeholder="e.g. Appleseed" required>
                </div>
                <div class="form-group">
                    <label for="studentYearGroup">Year Group</label>
                    <select id="studentYearGroup" name="yearGroup" required style="width:100%">
                        <option value="9">Year 9</option>
                        <option value="10">Year 10</option>
                        <option value="11">Year 11</option>
                        <option value="12">Year 12</option>
                        <option value="13">Year 13</option>
                    </select>
                    <div style="margin-top: 4px; font-size: 12px; width: 100%;">
                        <a href="#" id="uploadCsvLink" style="color: var(--accent); text-decoration: none;">Upload CSV instead</a>
                        <input type="file" id="csvUpload" accept=".csv, .txt" style="display: none;">

                    </div>
                </div>

                <div class="student-characteristics">
                    <?php foreach ([
                        'pp' => ['Pupil Premium (PP)', ['1' => 'True', '0' => 'False']],
                        'fsm_ever' => ['FSM Ever', ['1' => 'True', '0' => 'False']],
                        'gender' => ['Gender', ['F' => 'Female', 'M' => 'Male', 'O' => 'Other']],
                        'sen_status' => ['SEN Status', ['none' => 'No special educational needs', 'sen' => 'Special educational needs']],
                    ] as $field => [$label, $options]): ?>
                    <div class="form-group">
                        <label for="student_<?php echo $field; ?>"><?php echo $label; ?></label>
                        <select id="student_<?php echo $field; ?>" name="<?php echo $field; ?>">
                            <option value="">Not recorded</option>
                            <?php foreach ($options as $value => $text): ?>
                            <option value="<?php echo $value; ?>"><?php echo $text; ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <?php endforeach; ?>
                </div>

                <div class="form-group activity-only activity-mandatory">
                    <label style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="studentMandatory" name="mandatory" style="width:auto;">
                        Mandatory
                    </label>
                </div>

                <div class="form-group activity-only">
                    <label for="studentNote">Student Note (this activity only)</label>
                    <textarea id="studentNote" name="note" rows="3" placeholder="Optional note for this student on this activity..."></textarea>
                </div>
            </div>
            <div class="modal-footer" style="justify-content: space-between;">
                <button type="button" id="deleteStudentBtn" class="btn-secondary" style="color:var(--danger); border-color:var(--danger); display:none;">Delete</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" class="btn-secondary close-modal">Cancel</button>
                    <button type="submit" class="btn-primary" id="saveStudentBtn">Add Student</button>
                </div>
            </div>
        </form>
    </div>
</div>

<!-- CSV import preview -->
<div id="csvImportModal" class="modal-overlay" aria-hidden="true">
    <div class="modal">
        <div class="modal-header"><h3>Import students</h3><button type="button" class="icon-btn close-modal" aria-label="Close import">×</button></div>
        <form id="csvImportForm">
            <div class="modal-body">
                <p class="form-help">Creates new students only. Existing student records will not be updated.</p>
                <label class="checkbox-label"><input type="checkbox" id="csvHasHeader"> First row contains column headings</label>
                <div class="form-group"><label for="csvNameOrder">Full-name order (names without a comma)</label><select id="csvNameOrder"><option value="first_last">First name then surname</option><option value="last_first">Surname then first name</option></select></div>
                <div id="csvMappings" class="student-characteristics"></div>
                <p class="form-help">Unmapped fields are Not recorded. A blank mapped SEN cell means no needs. Unmapped year group defaults to Year 9.</p>
                <p id="csvImportSummary" aria-live="polite"></p>
                <p id="csvImportError" role="alert" hidden></p>
                <div class="csv-preview-scroll"><table class="students-table" id="csvPreview"></table></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn-secondary close-modal">Cancel</button><button type="submit" class="btn-primary" id="confirmCsvImport">Import students</button></div>
        </form>
    </div>
</div>

<div id="eventNoteModal" class="modal-overlay" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="eventNoteTitle">
        <div class="modal-header"><h3 id="eventNoteTitle">Event notes</h3><button type="button" class="close-modal" aria-label="Close">×</button></div>
        <form id="eventNoteForm">
            <div class="modal-body"><div class="form-group"><label for="eventNoteText">Student notes</label><textarea id="eventNoteText" rows="5"></textarea></div></div>
            <div class="modal-footer"><button type="button" class="btn-secondary close-modal">Cancel</button><button type="submit" id="saveEventNote" class="btn-primary">Save notes</button></div>
        </form>
    </div>
</div>

<!-- Activity Modal -->
<div id="activityModal" class="modal-overlay" aria-hidden="true">
    <div class="modal">
        <div class="modal-header">
            <h3 id="activityModalTitle">New Activity</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <form id="activityForm" autocomplete="off">
            <input type="hidden" id="activityIdInput" name="id">
            <div class="modal-body">
                <div class="form-group">
                    <label for="activityNameInput">Activity Name</label>
                    <input id="activityNameInput" name="name" placeholder="e.g. Football" required>
                </div>
                <div class="form-group">
                    <label for="activityDescriptionInput">Description</label>
                    <textarea id="activityDescriptionInput" name="description" placeholder="Optional description..." rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label>Departments</label>
                    <div id="departmentSelector" class="tags-input-container" style="padding: 8px; gap: 8px;">
                        <!-- Will be populated by JS -->
                    </div>
                    <input type="hidden" id="activityDepartmentInput" name="department">
                </div>
                <div id="eventFields" hidden></div>
                <div class="form-group" id="recurringSessionField">
                    <label for="activitySessions">Sessions per Week</label>
                    <select id="activitySessions" name="sessions_per_week" required style="width:100%">
                        <option value="1">1 Session</option>
                        <option value="2">2 Sessions</option>
                        <option value="3">3 Sessions</option>
                        <option value="4">4 Sessions</option>
                        <option value="5">5 Sessions</option>
                    </select>
                </div>

                <div id="wholeSchoolOptions" hidden>
                    <fieldset class="form-group year-options">
                        <legend>Eligible year groups</legend>
                        <div class="year-checkboxes">
                        <?php foreach ([9, 10, 11, 12, 13] as $year): ?>
                            <label><input type="checkbox" name="eligible_year" value="<?php echo $year; ?>"> Year <?php echo $year; ?></label>
                        <?php endforeach; ?>
                        </div>
                    </fieldset>
                    <div class="form-group">
                        <label class="checkbox-label"><input type="checkbox" id="allStudentsMandatory"> All students mandatory</label>
                        <p id="automaticRosterHelp" class="form-help" hidden>Every student in the selected years is assigned automatically. The register stays up to date when students join or change year.</p>
                    </div>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="activityHasMandatory" name="has_mandatory">
                        Enable Mandatory column
                    </label>
                </div>
                <div class="form-group">
                    <label>Assigned Students</label>
                    <div id="activityStudentTags" class="tags-input-container">
                        <!-- Tags will go here -->
                        <button type="button" id="addStudentTagBtn" class="btn-tag-add">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Add
                        </button>
                    </div>
                    <div id="studentPickerDropdown" class="student-picker-dropdown" style="display:none;">
                        <input type="text" id="studentPickerSearch" placeholder="Search students..." autocomplete="off">
                        <div id="studentPickerList" class="student-picker-list"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="justify-content: space-between;">
                <button type="button" id="deleteActivityBtn" class="btn-secondary" style="color:var(--danger); border-color:var(--danger); display:none;">Delete</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" class="btn-secondary close-modal">Cancel</button>
                    <button type="submit" class="btn-primary" id="saveActivityBtn">Create Activity</button>
                </div>
            </div>
        </form>
    </div>
</div>

<!-- Add to Activity Modal -->
<div id="addToActivityModal" class="modal-overlay" aria-hidden="true">
    <div class="modal">
        <div class="modal-header">
            <h3>Add Students to Activity</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <form id="addToActivityForm">
            <div class="modal-body">
                <div class="form-group">
                    <label for="targetActivitySelect">Select Activity</label>
                    <select id="targetActivitySelect" class="form-control" required>
                        <option value="">-- Select Activity --</option>
                    </select>
                </div>
                <p id="selectedCountText" style="color: var(--text-secondary); font-size: 14px; margin-top: 8px;"></p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary close-modal">Cancel</button>
                <button type="submit" class="btn-primary">Add Students</button>
            </div>
        </form>
    </div>
</div>

<!-- Assign Students Modal -->
<div id="assignStudentModal" class="modal-overlay" aria-hidden="true">
    <div class="modal">
        <div class="modal-header">
            <h3>Assign Students</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <form id="assignStudentForm">
            <div class="modal-body">
                <div class="form-group">
                    <label>Students in this Activity</label>
                    <div id="assignStudentTags" class="tags-input-container">
                        <!-- Tags will go here -->
                        <button type="button" id="assignStudentAddBtn" class="btn-tag-add">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Add
                        </button>
                        <button type="button" id="assignYearGroupBtn" class="btn-tag-add btn-tag-add-emphasis">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Add Year Group
                        </button>
                    </div>
                    <div id="assignStudentDropdown" class="student-picker-dropdown" style="display:none;">
                        <input type="text" id="assignStudentSearch" placeholder="Search students..." autocomplete="off">
                        <div id="assignStudentList" class="student-picker-list"></div>
                    </div>
                    <div id="assignYearGroupDropdown" class="student-picker-dropdown" style="display:none;">
                        <div class="student-picker-list" id="assignYearGroupList">
                            <div class="picker-item" data-yg="9">Year 9</div>
                            <div class="picker-item" data-yg="10">Year 10</div>
                            <div class="picker-item" data-yg="11">Year 11</div>
                            <div class="picker-item" data-yg="12">Year 12</div>
                            <div class="picker-item" data-yg="13">Year 13</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary close-modal">Cancel</button>
                <button type="submit" class="btn-primary">Save Changes</button>
            </div>
        </form>
    </div>
</div>

<!-- Student Stats Modal -->
<div id="studentStatsModal" class="modal-overlay" aria-hidden="true">
    <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
            <h3 id="studentStatsTitle">Student Statistics</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div class="modal-body">
            <div class="stats-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 16px;">
                <div class="stat-card">
                    <h3 data-activity-label="Total Sessions" data-event-label="Total Events">Total Sessions</h3>
                    <div class="stat-value" id="studentTotalSessions">0</div>
                </div>
                <div class="stat-card">
                    <h3 data-activity-label="Activities Attended" data-event-label="Events Attended">Activities Attended</h3>
                    <div class="stat-value" id="studentTotalActivities">0</div>
                </div>
            </div>
            
            <h4>Attendance by Activity</h4>
            <div id="studentActivityList" style="margin-bottom: 16px; max-height: 150px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;"></div>

            <h4>Recent History</h4>
            <div id="studentHistoryList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;"></div>
        </div>
        <div class="modal-footer">
            <button type="button" id="downloadStudentCsvBtn" class="btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download Report
            </button>
            <button type="button" class="btn-primary close-modal">Close</button>
        </div>
    </div>
</div>

<!-- Activity Stats Modal -->
<div id="activityStatsModal" class="modal-overlay" aria-hidden="true">
    <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
            <h3 id="activityStatsTitle">Activity Statistics</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div class="modal-body">
            <div class="stats-grid" style="grid-template-columns: 1fr; margin-bottom: 16px;">
                <div class="stat-card">
                    <h3>Total Attendance Count</h3>
                    <div class="stat-value" id="activityTotalAttendance">0</div>
                </div>
            </div>
            
            <h4>Top Students</h4>
            <div id="activityStudentList" style="margin-bottom: 16px; max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;"></div>

            <h4 id="activityTrendTitle" data-activity-label="Weekly Trend" data-event-label="Event Attendance">Weekly Trend</h4>
            <div style="height: 200px;">
                <canvas id="activityTrendChart"></canvas>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" id="downloadActivityCsvBtn" class="btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download Report
            </button>
            <button type="button" class="btn-primary close-modal">Close</button>
        </div>
    </div>
</div>

<!-- Add to Activity Modal -->
<div id="addToActivityModal" class="modal-overlay" aria-hidden="true">
    <div class="modal">
        <div class="modal-header">
            <h3>Add Students to Activity</h3>
            <button class="icon-btn close-modal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <form id="addToActivityForm">
            <div class="modal-body">
                <div class="form-group">
                    <label for="targetActivitySelect">Select Activity</label>
                    <select id="targetActivitySelect" class="form-control" required style="width:100%">
                        <option value="">-- Select Activity --</option>
                    </select>
                </div>
                <p id="selectedCountText" style="color: var(--text-secondary); font-size: 14px; margin-top: 8px;"></p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary close-modal">Cancel</button>
                <button type="submit" class="btn-primary">Add Students</button>
            </div>
        </form>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
<script src="https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/weekSelect/weekSelect.js"></script>
<script src="/assets/js/student-csv.js?v=1" defer></script>
<script src="/assets/js/student-picker.js?v=1" defer></script>
<script src="/assets/js/event-form.js?v=3" defer></script>
<script src="/assets/js/app.js?v=8" defer></script>
</body>
</html>
