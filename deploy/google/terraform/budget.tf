resource "google_billing_budget" "parsero" {
  count           = var.manage_billing_budget ? 1 : 0
  billing_account = var.billing_account_id
  display_name    = "Parsero - referencia mensal BRL 1500"

  # No project filter: this budget observes the whole Parsero billing account, including staging.
  budget_filter {
    calendar_period        = "MONTH"
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }
  amount {
    specified_amount {
      currency_code = "BRL"
      units         = "1500"
    }
  }
  dynamic "threshold_rules" {
    for_each = [0.5, 0.8, 1.0]
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }
  # An absent optional rule keeps default billing-admin/user emails enabled.
  # The API omits an all-default empty rule on read, so emit it only for custom channels.
  dynamic "all_updates_rule" {
    for_each = length(var.budget_notification_channels) > 0 ? [1] : []
    content {
      disable_default_iam_recipients   = false
      monitoring_notification_channels = var.budget_notification_channels
    }
  }
  lifecycle {
    precondition {
      condition     = var.environment == "production"
      error_message = "The account-wide budget is managed only from the production state."
    }
  }
  depends_on = [google_project_service.required]
}
