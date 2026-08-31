class Tab < ApplicationRecord
  validates :title, presence: true
  validates :body, presence: true
  validates :default_bpm, numericality: { only_integer: true, in: 20..300 }
end
