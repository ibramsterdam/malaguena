module Admin
  class TabsController < BaseController
    before_action :set_tab, only: %i[edit update destroy]

    def index
      @tabs = Tab.order(:title).includes(segments: :routine)
    end

    def new
      @tab = Tab.new(default_bpm: 80)
    end

    def create
      @tab = Tab.new(tab_params)
      if @tab.save
        redirect_to edit_admin_tab_path(@tab), notice: "Saved #{@tab.title}."
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit
    end

    def update
      if @tab.update(tab_params)
        redirect_to edit_admin_tab_path(@tab), notice: "Saved #{@tab.title}."
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      if @tab.destroy
        redirect_to admin_tabs_path, notice: "Deleted #{@tab.title}."
      else
        redirect_to admin_tabs_path,
                    alert: "#{@tab.title} is used by #{@tab.segments.map { |s| s.routine.name }.uniq.to_sentence} — remove it there first."
      end
    end

    private

    def set_tab
      @tab = Tab.find(params[:id])
    end

    def tab_params
      params.expect(tab: %i[title body default_bpm])
    end
  end
end
