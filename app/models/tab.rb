class Tab < ApplicationRecord
  has_many :segments, dependent: :restrict_with_error

  validates :title, presence: true
  validates :body, presence: true
  validates :default_bpm, numericality: { only_integer: true, in: 20..300 }

  # Total bars across all systems: one counted line per system (the high
  # e string opens each one), bars = pipes minus the opening one.
  def bar_count
    body.lines.select { |line| line.start_with?("e|") }.sum { |line| line.count("|") - 1 }
  end

  # The time signature, inferred from the tab itself: the player treats
  # every column of fret numbers as one beat, so the note columns inside
  # the first full bar give the beats per bar (3 for a waltz, 4 for
  # common time).
  def beats_per_bar
    system = []
    body.each_line do |line|
      if line.match?(/\A[A-Ga-g]?\|/)
        system << line.chomp
      elsif system.any?
        break
      end
    end
    return 4 if system.empty?

    reference = system.first
    opening = reference.index("|")
    closing = reference.index("|", opening + 1)
    return 4 unless closing

    columns = 0
    previous = false
    (opening + 1...closing).each do |position|
      note = system.any? { |line| line[position]&.match?(/\d/) }
      columns += 1 if note && !previous
      previous = note
    end
    columns.clamp(1, 12)
  end
end
