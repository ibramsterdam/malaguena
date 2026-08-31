module Admin
  class RoutinesController < BaseController
    before_action :set_routine, only: %i[edit update destroy]

    def index
      @routines = Routine.order(:name).includes(:segments)
    end

    def new
      @routine = Routine.new
      @routine.segments.build(kind: "tab_practice", position: 1, duration_minutes: 5)
    end

    def create
      @routine = Routine.new(routine_params)
      if @routine.save
        redirect_to edit_admin_routine_path(@routine), notice: "Saved #{@routine.name}."
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit
    end

    def update
      if @routine.update(routine_params)
        redirect_to edit_admin_routine_path(@routine), notice: "Saved #{@routine.name}."
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      @routine.destroy
      redirect_to admin_routines_path, notice: "Deleted #{@routine.name}."
    end

    private

    def set_routine
      @routine = Routine.includes(segments: :tab).find(params[:id])
    end

    def routine_params
      params.expect(routine: [:name, { segments_attributes: [%i[id kind position duration_minutes tab_id bpm _destroy]] }])
    end
  end
end
