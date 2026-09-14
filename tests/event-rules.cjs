const assert=require('node:assert/strict');
const {calculate}=require('../assets/js/event-form.js');
const students=[{id:1,year_group:9},{id:2,year_group:10},{id:3,year_group:11},{id:4,year_group:9}];
const rules={year_groups:[9,10],mandatory_year_groups:[9],manual_student_ids:[2],included_student_ids:[],excluded_student_ids:[1]};
assert.deepEqual(calculate(students,rules).map(s=>[s.id,s.mandatory]),[[1,false],[2,false],[4,true]]);
assert.deepEqual(calculate(students,{...rules,included_student_ids:[2,3]}).map(s=>[s.id,s.mandatory]),[[1,false],[2,true],[4,true]]);
assert.deepEqual(calculate(students,{...rules,mandatory_year_groups:[],manual_student_ids:[],excluded_student_ids:[1]}).map(s=>[s.id,s.mandatory]),[[1,false],[2,false],[4,false]]);
console.log('PASS: automatic eligible-year roster, mandatory precedence, exclusions and eligibility');
