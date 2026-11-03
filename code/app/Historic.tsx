import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { exportToCsv, getHistory, getHistoryForChart, HistoryRecord } from '../lib/db';

export default function Historic() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [chartData, setChartData] = useState<{
    labels: string[];
    angleData: number[];
    distanceData: number[];
    tempData: number[];
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadHistory = async () => {
    try {
      const [historyData, chartDataResult] = await Promise.all([
        getHistory(50),
        getHistoryForChart(7),
      ]);
      setHistory(historyData);
      setChartData(chartDataResult);
    } catch (error) {
      console.log('Error loading history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  // ===================== EXPORT CSV =====================
  const handleExport = async () => {
    try {
      setExporting(true);
      const csv = await exportToCsv();

      if (!csv || csv.split('\n').length <= 1) {
        Alert.alert('Export', 'No data to export.');
        return;
      }

      const filename = `missile_history_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      const path = (FileSystem.documentDirectory ?? '') + filename;

      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/csv',
          dialogTitle: 'Export detection history',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Export', `File saved at:\n${path}`);
      }
    } catch (err) {
      console.log('Export error:', err);
      Alert.alert('Export error', String(err));
    } finally {
      setExporting(false);
    }
  };

  // ===================== HELPERS =====================
  const formatDate = (date: Date) =>
    new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading History...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>History</Text>

      {/* Export button */}
      <TouchableOpacity
        style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
        onPress={handleExport}
        disabled={exporting}
      >
        <Text style={styles.exportButtonText}>
          {exporting ? 'Exporting...' : '⬇  EXPORT CSV'}
        </Text>
      </TouchableOpacity>

      {/* Charts */}
      {chartData && chartData.labels.length > 0 && (
        <>
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Angle (°)</Text>
            <LineChart
              data={{
                labels: chartData.labels.slice(-10),
                datasets: [{ data: chartData.angleData.slice(-10) }],
              }}
              width={Dimensions.get('window').width - 40}
              height={180}
              chartConfig={chartConfigRed}
              bezier
              style={styles.chart}
            />
          </View>

          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Distance (cm)</Text>
            <LineChart
              data={{
                labels: chartData.labels.slice(-10),
                datasets: [{ data: chartData.distanceData.slice(-10) }],
              }}
              width={Dimensions.get('window').width - 40}
              height={180}
              chartConfig={chartConfigRed}
              bezier
              style={styles.chart}
            />
          </View>

          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Temperature (°C)</Text>
            <LineChart
              data={{
                labels: chartData.labels.slice(-10),
                datasets: [{ data: chartData.tempData.slice(-10) }],
              }}
              width={Dimensions.get('window').width - 40}
              height={180}
              chartConfig={chartConfigBlue}
              bezier
              style={styles.chart}
            />
          </View>
        </>
      )}

      {/* Records list */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>
          Recent Records ({history.length})
        </Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No history data available</Text>
        ) : (
          history.map(record => (
            <View key={record.id} style={styles.recordCard}>
              <Text style={styles.recordDate}>{formatDate(record.timestamp)}</Text>
              <View style={styles.recordRow}>
                <Text style={styles.recordLabel}>Angle</Text>
                <Text style={styles.recordValue}>{record.angle?.toFixed(1)}°</Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={styles.recordLabel}>Distance</Text>
                <Text style={styles.recordValue}>
                  {record.distance?.toFixed(1)} cm
                </Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={styles.recordLabel}>Temp</Text>
                <Text style={styles.recordValue}>
                  {record.temperature?.toFixed(1)}°C
                </Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={styles.recordLabel}>Humidity</Text>
                <Text style={styles.recordValue}>{record.humidity}%</Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={styles.recordLabel}>Weather</Text>
                <Text style={styles.recordValue}>{record.weatherCondition ?? '—'}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ===================== CHART CONFIGS =====================
const chartConfigRed = {
  backgroundColor: '#1a1a1a',
  backgroundGradientFrom: '#ff0000',
  backgroundGradientTo: '#ff4444',
  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  decimalPlaces: 1,
};

const chartConfigBlue = {
  backgroundColor: '#1a1a1a',
  backgroundGradientFrom: '#00aaff',
  backgroundGradientTo: '#44ccff',
  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  decimalPlaces: 1,
};

// ===================== STYLES =====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', padding: 20 },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 20,
    color: '#ff0000',
    textAlign: 'center',
  },

  exportButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ff0000',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  exportButtonDisabled: { opacity: 0.5 },
  exportButtonText: {
    color: '#ff0000',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  chartContainer: {
    marginBottom: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 15,
  },
  chartTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  chart: { borderRadius: 16, marginVertical: 10 },

  listContainer: { marginTop: 10, marginBottom: 30 },
  listTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 15 },

  recordCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ff0000',
  },
  recordDate: { color: '#888', fontSize: 12, marginBottom: 10 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 },
  recordLabel: { color: '#888', fontSize: 14 },
  recordValue: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  emptyText: { color: '#888', textAlign: 'center', marginTop: 20, fontSize: 16 },
});
