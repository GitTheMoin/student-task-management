variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "workers_subdomain" {
  description = "Your account's workers.dev subdomain (used to build the app URL output)"
  type        = string
}

variable "worker_name" {
  description = "Name of the Cloudflare Worker"
  type        = string
  default     = "student-task-manager"
}

variable "kv_namespace_name" {
  description = "Title of the Workers KV namespace"
  type        = string
  default     = "student_tasks"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "dev"
}

variable "compatibility_date" {
  description = "Workers runtime compatibility date (YYYY-MM-DD)"
  type        = string
  default     = "2026-05-03"
}