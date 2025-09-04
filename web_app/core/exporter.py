import io

import pandas as pd
from core.serializers import ExporterSerializer


class ExporterContract:
    def __init__(self, data, format, cols, *args, for_user=None, **kwargs):
        self._data = data
        self._format = format
        self._args = args
        self._kwargs = kwargs
        self._export_data = []
        self._cols = cols
        self._export_cols = []
        self._serializer = None
        self.for_user = for_user

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
            _rows = [
                list(i.values())
                for i in ExporterSerializer(
                    instance=self._data, many=True, context={"user": self.for_user}
                ).data
            ]
        self._export_data.extend(_rows)

    def _prepare_cols(self):
        cols = ExporterSerializer(
            instance=self._data.first(), context={"user": self.for_user}
        ).get_cols_names()
        self._export_cols.extend(cols)

    def process(self):
        data_buffer = io.BytesIO()
        pd.DataFrame(self._export_data, columns=self._export_cols).to_excel(
            data_buffer, index=False
        )
        data_buffer.seek(0)
        return data_buffer
