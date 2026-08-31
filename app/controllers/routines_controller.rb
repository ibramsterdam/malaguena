class RoutinesController < ApplicationController
  before_action :set_routine, only: %i[show edit update destroy]

  def index
    @routines = Routine.order(:name).includes(:segments)
  end

  def show
  end

  def new
    @routine = Routine.new
    @routine.segments.build(kind: "tab_practice", position: 1, duration_minutes: 10)
  end

  def create
    @routine = Routine.new(routine_params)
    if @routine.save
      redirect_to @routine, notice: "Saved #{@routine.name}."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @routine.update(routine_params)
      redirect_to @routine, notice: "Saved #{@routine.name}."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @routine.destroy
    redirect_to routines_path, notice: "Deleted #{@routine.name}."
  end

  private

  def set_routine
    @routine = Routine.includes(segments: :tab).find(params[:id])
  end

  def routine_params
    params.expect(routine: [:name, { segments_attributes: [%i[id kind position duration_minutes tab_id bpm _destroy]] }])
  end
end
