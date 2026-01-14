from aiogram.fsm.state import State, StatesGroup


class CreateListing(StatesGroup):
    waiting_for_title = State()
    waiting_for_description = State()
    waiting_for_photos = State()
    waiting_for_category = State()
    waiting_for_price = State()
    waiting_for_condition = State()
    waiting_for_location = State()
    waiting_for_confirmation = State()
