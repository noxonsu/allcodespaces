from uuid import uuid4

import pytest


@pytest.fixture(scope="module")
def button_data():
    return dict(
            id=uuid4(),
            title='string on the btn',
            url='https://www.google.com',
        )


@pytest.fixture(scope="module")
def message_data():
    return dict(
        id=uuid4(),
        as_text='The message is fake',
        name='fake message',
        title='fake title',
        body='fake body',
        image='path/to/image',
        video='path/to/video',
        created_at='2025-1-1',
        updated_at='2025-1-2',
        button=dict(id=uuid4(), title='fake button', url='https://www.google.com'),
        is_external=True,
    )



@pytest.fixture(scope="module")
def campaignchannel_data():
    return dict(
         id=uuid4(),
         name="fake campaign",
         budget="45.45",
         start_date="2024-1-1",
         finish_date="2024-1-3",
         message=dict(
        id=uuid4(),
        as_text='The message is fake',
        name='fake message',
        title='fake title',
        body='fake body',
        image='path/to/image',
        video='path/to/video',
        created_at='2025-1-1',
        updated_at='2025-1-2',
        button=dict(id=uuid4(), title='fake button', url='https://www.google.com'),
        is_external=True,
    ),
         black_list=['block'],
         white_list=['allow'],
         client="client",
         brand="client",
  )


@pytest.fixture(scope="module")
def channeladmin_data():
    return dict(
            id=uuid4(),
            username='username fake',
            first_name='fake first',
            last_name='fake last',
            phone_number='1234567890',
            tg_id='1234567890',
            is_bot_installed=True,
        )