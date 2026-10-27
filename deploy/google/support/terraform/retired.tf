# The instance deletion retires its databases. Forget the database child only;
# do not issue a separate DROP DATABASE against a stopped or preserved source.
removed {
  from = google_sql_database.client
  lifecycle {
    destroy = false
  }
}
