import io

import pandas as pd
from django.core.exceptions import FieldDoesNotExist

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
        self._prepare_data()

    def process(self):
        raise NotImplementedError

    def _prepare_data(self):
        raise NotImplementedError

    def _get_col_data(self, obj, col):
        raise NotImplementedError

    def _get_col_name(self, obj, col):
        raise NotImplementedError

class QuerySetExporter(ExporterContract):
    def _prepare_data(self):
        self._prepare_cols()
        for obj in self._data:
            _row = []
            for col in self._cols:
                _row.append(self._get_col_data(obj, col))
            self._export_data.append(_row)

    def _get_col_data(self, obj, col):
        return str(getattr(obj, col)) if getattr(obj, col, None) is not None else '-'

    def _prepare_cols(self):
        model = self._data.model
        model_meta = model._meta

        for col in self._cols:
            col_name = "COL_NAME_NOT_FOUND"
            try:
                col_name = model_meta.get_field(col).verbose_name
            except FieldDoesNotExist  as e:
                col_name =get_property_attr(col,model, 'short_description')
            finally:
                self._export_cols.append(col_name)

    def process(self):
        data_buffer = io.BytesIO()
        pd.DataFrame(self._export_data, columns=self._export_cols).to_excel(data_buffer, index=False)
        data_buffer.seek(0)
        return data_buffer