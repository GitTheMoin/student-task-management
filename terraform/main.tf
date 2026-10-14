# 1. KV namespace
resource "cloudflare_workers_kv_namespace" "tasks" {
  account_id = var.account_id
  title      = var.kv_namespace_name
}

# 2. Worker (container resource)
resource "cloudflare_worker" "app" {
  account_id = var.account_id
  name       = var.worker_name

  observability = {
    enabled = true
  }

  subdomain = {
    enabled = true # exposes <name>.<subdomain>.workers.dev
  }
}

# 3. Worker version: code + KV binding + variables
resource "cloudflare_worker_version" "app" {
  account_id         = var.account_id
  worker_id          = cloudflare_worker.app.id
  compatibility_date = var.compatibility_date
  main_module        = "worker.js"

  modules = [{
    name         = "worker.js"
    content_type = "application/javascript+module"
    content_file = "${path.module}/../application/worker.js"
  }]

  bindings = [
    {
      type         = "kv_namespace"
      name         = "TASKS_KV"
      namespace_id = cloudflare_workers_kv_namespace.tasks.id
    },
    {
      type = "plain_text"
      name = "ENVIRONMENT"
      text = var.environment
    }
  ]
}

# 4. Deployment: send 100% of traffic to that version
resource "cloudflare_workers_deployment" "app" {
  account_id  = var.account_id
  script_name = cloudflare_worker.app.name
  strategy    = "percentage"

  versions = [{
    percentage = 100
    version_id = cloudflare_worker_version.app.id
  }]
}