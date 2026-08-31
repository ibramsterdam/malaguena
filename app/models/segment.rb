class Segment < ApplicationRecord
  KIND_LABELS = { "tab_practice" => "Tab practice", "rest" => "Break", "free_play" => "Free play" }.freeze

  belongs_to :routine, inverse_of: :segments
  belongs_to :tab, optional: true

  enum :kind, { tab_practice: "tab_practice", rest: "rest", free_play: "free_play" }

  validates :duration_seconds, numericality: { only_integer: true, greater_than: 0 }
  validates :position, numericality: { only_integer: true }
  validates :tab, presence: { message: "must be picked for a tab practice segment" }, if: :tab_practice?
  validates :bpm, numericality: { only_integer: true, in: 20..300, allow_nil: true }

  def label
    tab_practice? && tab ? tab.title : KIND_LABELS.fetch(kind)
  end

  def effective_bpm
    bpm.presence || tab&.default_bpm || 80
  end

  def duration_minutes
    (duration_seconds || 0) / 60.0
  end

  def duration_minutes=(minutes)
    self.duration_seconds = (minutes.to_f * 60).round if minutes.present?
  end
end
