class ApplicationController < ActionController::Base
  allow_browser versions: :modern
  before_action :require_app_password

  private

  # One shared password (MALAGUENA_PASSWORD) instead of user accounts. When the
  # variable is unset — local development — the app is open.
  def require_app_password
    password = ENV["MALAGUENA_PASSWORD"]
    return if password.blank?

    authenticate_or_request_with_http_basic("Malaguena") do |_name, given|
      ActiveSupport::SecurityUtils.secure_compare(given, password)
    end
  end
end
