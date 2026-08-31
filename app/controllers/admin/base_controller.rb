module Admin
  class BaseController < ApplicationController
    layout "admin"

    before_action :require_admin_password

    private

    # The admin has its own password, kept in the encrypted credentials
    # (admin.password), separate from the app-wide gate. The prompt always
    # appears; with no credential configured, nothing gets in.
    def require_admin_password
      password = Rails.application.credentials.dig(:admin, :password)

      authenticate_or_request_with_http_basic("Malaguena admin") do |_name, given|
        password.present? && ActiveSupport::SecurityUtils.secure_compare(given, password)
      end
    end
  end
end
