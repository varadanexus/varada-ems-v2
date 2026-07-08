Set-Location 'D:\Varada EMS 2.0\new-ems'

Write-Host "=== PROJECT ENGINE TABLES ===" -ForegroundColor Cyan
supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('projects','project_types','project_stages','project_tasks','project_milestones','project_assignments','project_approval_requests','project_site_updates','project_media','project_documents','project_templates','project_template_stages','project_template_tasks','project_template_milestones','project_code_sequences','project_status_history') ORDER BY table_name;" 2>&1

Write-Host ""
Write-Host "=== INTERIORS TABLES ===" -ForegroundColor Cyan
supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'interior%' ORDER BY table_name;" 2>&1

Write-Host ""
Write-Host "=== USER_ROLES COUNT ===" -ForegroundColor Cyan
supabase db query --linked "SELECT COUNT(*) AS user_roles_count FROM user_roles;" 2>&1

Write-Host ""
Write-Host "=== ROLES TABLE ===" -ForegroundColor Cyan
supabase db query --linked "SELECT id, name FROM roles WHERE name = 'super_admin';" 2>&1
