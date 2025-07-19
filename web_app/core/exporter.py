import io

import pandas as pd
from django.core.exceptions import FieldDoesNotExist

from core.serializers import ExporterSerializer
from core.utils import get_property_attr


class ExporterContract:
    def __init__(self, data, format, cols,*args, **kwargs):
        self._data = data
        self._format = format
        self._args = args
        self._kwargs = kwargs
        self._export_data = []
        self._cols = cols
        self._export_cols = []
        self._serializer = None

        self._prepare_data()

    def process(self):
        raise NotImplementedError

    def _prepare_data(self):
        raise NotImplementedError


    def _get_col_name(self, obj, col):
        raise NotImplementedError

class QuerySetExporter(ExporterContract):
    def _prepare_data(self):
        self._prepare_cols()
        _rows = []
        if self._data:
            _rows = [list(i.values()) for i in ExporterSerializer(instance=self._data, many=True).data]
        self._export_data.extend(_rows)

    def _prepare_cols(self):
        cols = ExporterSerializer(instance=self._data.first()).get_cols_names()
        self._export_cols.extend(cols)

    def process(self):
        data_buffer = io.BytesIO()
        pd.DataFrame(self._export_data, columns=self._export_cols).to_excel(data_buffer, index=False)
        data_buffer.seek(0)
        return data_buffer