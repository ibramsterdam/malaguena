module ApplicationHelper
  def nav_items
    [["Routines", routines_path], ["Tabs", tabs_path], ["Metronome", metronome_path], ["Tuner", tuner_path]]
  end

  def format_duration(seconds)
    minutes, rest = seconds.divmod(60)
    rest.zero? ? "#{minutes} min" : format("%d:%02d min", minutes, rest)
  end
end
