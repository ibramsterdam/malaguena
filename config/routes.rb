Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Read-only for now: content is seeded through the console until
  # editing grows real users and real requirements. Tabs have no UI of
  # their own yet — they live inside routines until a proper song list
  # arrives.
  resources :routines, only: %i[index show]
  get "metronome" => "metronome#show"
  get "tuner" => "tuner#show"

  root "home#index"
end
