output "worker_name" {
  value = cloudflare_worker.app.name
}

output "kv_namespace_id" {
  value = cloudflare_workers_kv_namespace.tasks.id
}

output "application_url" {
  value = "https://${cloudflare_worker.app.name}.${var.workers_subdomain}.workers.dev"
}