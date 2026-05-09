import Modal from "./Modal";

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ClearDataModal = ({ isOpen, onClose, onConfirm }: ClearDataModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-6">Очистить данные гонки</h2>
        
        <div className="text-gray-300 mb-8 text-left">
          <div className="mb-4">
            <p className="text-lg mb-4">Вы уверены, что хотите очистить все данные гонки?</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
              <strong className="text-red-300 text-lg block mb-3">Будет удалено:</strong>
              <ul className="space-y-1 text-red-200">
                <li>• Все события</li>
                <li>• Все команды</li>
                <li>• Цвета картов</li>
              </ul>
            </div>
            
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
              <strong className="text-green-300 text-lg block mb-3">Останется:</strong>
              <ul className="space-y-1 text-green-200">
                <li>• Начальное состояние питлейна</li>
                <li>• Настройки приложения</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Очистить
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ClearDataModal;