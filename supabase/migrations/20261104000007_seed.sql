-- 007_seed.sql
-- Platform ledger accounts, the standard NDA and starter task templates.

-- Platform ledger accounts (created up front so reconciliation always finds them).
do $$
begin
  perform custody_account('monnify');
  perform custody_account('paystack');
  perform platform_account('platform_revenue');
  perform platform_account('processor_fees');
  perform platform_account('payouts_in_flight');
end $$;

-- Platform standard NDA. Replace the body with lawyer-approved wording before launch;
-- the version hash changes automatically, and doers must sign the version in force.
insert into nda_documents (owner_type, owner_id, title, body) values
(null, null, 'Standard task NDA (DRAFT – lawyer to approve)',
 'DRAFT. The doer agrees to keep confidential all materials shared for this task, '
 'to use them only to complete the task, not to copy, share or publish them, and to '
 'delete any copies when the task ends. This agreement is between the doer and the task creator.');

insert into task_templates
  (name, category, description, form_schema, default_proof_type, default_review_mode, suggested_reward_kobo)
values
('Customer satisfaction survey', 'native',
 'Rate a product or service and explain why.',
 '{"questions":[
    {"id":"q1","type":"rating","label":"How satisfied are you overall?","scale":5,"required":true},
    {"id":"q2","type":"single_choice","label":"How often do you use it?","options":["Daily","Weekly","Monthly","Rarely"],"required":true},
    {"id":"q3","type":"long_text","label":"What should we improve?","min_length":30,"required":true},
    {"id":"ac1","type":"attention_check","label":"Select ''Agree'' for this question","answer":"Agree"}]}',
 'form', 'auto', 50000),

('Product or concept feedback', 'native',
 'Look at a product idea or design and answer structured questions.',
 '{"questions":[
    {"id":"q1","type":"file_view","label":"Review the attached concept","required":true},
    {"id":"q2","type":"likert_grid","label":"Rate each statement","rows":["Easy to understand","Useful to me","Would pay for it"],"required":true},
    {"id":"q3","type":"long_text","label":"What would stop you from using it?","min_length":30,"required":true}]}',
 'form', 'auto', 100000),

('Document or material review', 'proof_based',
 'Read a document and complete a structured review.',
 '{"questions":[
    {"id":"q1","type":"file_view","label":"Read the attached material","required":true},
    {"id":"q2","type":"rating","label":"Overall quality","scale":5,"required":true},
    {"id":"q3","type":"long_text","label":"Main issues found","min_length":100,"required":true},
    {"id":"q4","type":"file_upload","label":"Upload your marked-up copy (optional)","required":false}]}',
 'mixed', 'manual', 100000),

('App or website testing', 'proof_based',
 'Follow test steps, report bugs with screenshots.',
 '{"questions":[
    {"id":"q1","type":"checklist","label":"Complete each step","items":["Sign up","Complete the main action","Log out and back in"],"required":true},
    {"id":"q2","type":"file_upload","label":"Screenshots of each step","accept":["image/*"],"min_files":3,"required":true},
    {"id":"q3","type":"repeatable_group","label":"Bugs found","fields":["Where","What happened","Expected"]}]}',
 'mixed', 'manual', 150000),

('Data labelling', 'proof_based',
 'Label a batch of images or text items.',
 '{"questions":[{"id":"q1","type":"labelling_batch","label":"Choose one label per item","labels":[],"items_per_batch":50,"required":true}]}',
 'form', 'manual', 100000),

('Knowledge quiz', 'native',
 'Multiple-choice quiz; passing the mark approves automatically.',
 '{"pass_mark_percent":70,"questions":[]}',
 'form', 'auto', 50000);
