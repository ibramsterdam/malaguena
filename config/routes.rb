Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # The public site is read-only; creating and editing happens in the
  # admin, behind its own password.
  resources :routines, only: %i[index show]

  namespace :admin do
    root "tabs#index"
    resources :tabs, except: %i[show]
    resources :routines, except: %i[show]
  end
  get "metronome" => "metronome#show"
  get "tuner" => "tuner#show"

  root "home#index"
end
