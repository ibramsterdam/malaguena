class Routine < ApplicationRecord
  has_many :segments, -> { order(:position) }, dependent: :destroy, inverse_of: :routine
  accepts_nested_attributes_for :segments, allow_destroy: true

  validates :name, presence: true
  validates :segments, presence: { message: "are needed — add at least one" }

  def total_seconds
    segments.sum(:duration_seconds)
  end
end
