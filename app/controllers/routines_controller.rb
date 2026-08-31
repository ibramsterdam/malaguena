class RoutinesController < ApplicationController
  def index
    @routines = Routine.order(:name).includes(:segments)
  end

  def show
    @routine = Routine.includes(segments: :tab).find(params[:id])
  end
end
